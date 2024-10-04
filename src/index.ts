import express from 'express';
import { PostHog } from 'posthog-node';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';

import { getIdsFromCookies, getVisitInfo } from './utils';

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = 3231;

const YEAR_IN_MS = 3600000 * 24 * 365;
const THIRTY_MIN_IN_MS = 3600000 / 2;

const posthog = new PostHog(process.env.PH_API_KEY ?? '', {
  host: process.env.PH_HOST,
  disableGeoip: false // Events that are generated on the server-side must override this to true.
});

posthog.debug()

const allowedOrigins = ['http://localhost:8082', 'http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, origin);
    } else {
        callback(new Error('Not allowed by CORS'));
    }
    },
    credentials: true,
  }));

app.use(express.json());
app.use(cookieParser());

app.post('/telemetry/identify', (req, res) => {
    const { user: { id: distinctId, organizations } } = req.body;

    posthog.identify({
        distinctId,
    });
    res.cookie('userId', distinctId, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });
    
    const anonymousId = req.cookies.anonymousId;
    if(!!anonymousId)
    posthog.alias({
        distinctId,
        alias: anonymousId,
    })

    const firstUserOrganization = organizations[0];
    if(!!firstUserOrganization){
      posthog.groupIdentify({
        distinctId,
        groupType: 'organization',
        groupKey: firstUserOrganization.id,
      })
      res.cookie('organizationId', firstUserOrganization.id, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });
    }

    if(!!firstUserOrganization?.projects.length){
      posthog.groupIdentify({
        distinctId,
        groupType: 'project',
        groupKey: firstUserOrganization.projects[0].id,
      })
      res.cookie('projectId', firstUserOrganization.projects[0].id, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });
    }

    res.status(200).send('Identified');
})

app.post('/telemetry/reset', (req, res) => {
  res.clearCookie('userId');
  res.clearCookie('organizationId');
  res.clearCookie('projectId');
  res.clearCookie('anonymousId');
  res.clearCookie('sessionId');
  res.status(200).send('Reset');
})

app.post('/telemetry/groups/identify', (req, res) => {
  const { organizationId, projectId } = req.body;

  const userId = req.cookies.userId;
  if(!userId) return;

  if(!!organizationId) {
    posthog.groupIdentify({
      distinctId: userId,
      groupType: 'organization',
      groupKey: organizationId,
    });
    res.cookie('organizationId', organizationId, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });
  }
  if(!!projectId) {
    posthog.groupIdentify({
      distinctId: userId,
      groupType: 'project',
      groupKey: projectId,
    });
    res.cookie('projectId', projectId, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });
  }
})

app.post('/telemetry/groups/reset', (req, res) => {
  const { resetOrganization, resetProject } = req.body;
  if(resetOrganization) res.clearCookie('organizationId');
  if(resetProject) res.clearCookie('projectId');
  res.status(200).send('Groups reset');
})

app.post('/telemetry/event', (req, res) => {
  const {action, category, label, value, ga, current_url, page_location, page_title, page_referrer: referrer } = req.body;
  const $ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  const { organizationId, projectId, userId, anonymousId, sessionId } = getIdsFromCookies(req.cookies);
  const visitProperties = getVisitInfo({ userAgent: ga.userAgent, referrer, search: ga.search });

  posthog.capture({
    distinctId: userId ?? anonymousId,
    event: action,
    properties: {
        $process_person_profile: !!userId,
        $current_url: current_url,
        $host: new URL(current_url).hostname,
        $pathname: page_location,
        $session_id: sessionId,
        $ip,
        page_title,
        category,
        label,
        value,
        ...visitProperties
    },
    ...(!!organizationId && {
      groups: { organization: organizationId, ...!!projectId && { project: projectId }}
    }),
    sendFeatureFlags: true, // For future adoption - we want to send feature flags with every event so that we can use them in event analysis in PostHog.
  });

  res.cookie('sessionId', sessionId, { httpOnly: true, maxAge: THIRTY_MIN_IN_MS, sameSite: 'lax' });
  res.cookie('anonymousId', anonymousId, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });

  if(userId) res.cookie('userId', userId, { httpOnly: true, maxAge: THIRTY_MIN_IN_MS, sameSite: 'lax' });
  if(organizationId) res.cookie('organizationId', organizationId, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });
  if(projectId) res.cookie('projectId', projectId, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });

  res.status(200).send('Event tracked');
});

app.post('/telemetry/page', (req, res)=> {
  const event = req.body;
  const $ip = (req.headers.host === 'localhost' || '127.0.0.1') ? undefined : req.headers['x-forwarded-for'] ?? req.socket.remoteAddress;

  /**
   * We need to check if this is the initial (i.e. first ever) session for the user. If it is, we need to set additional initial user properties.
   */
  const isInitialSession = !req.cookies.sessionId && !req.cookies.anonymousId && !req.cookies.userId;

  /**
   * We need to check if the user has an active session. If not, we need to generate a new session ID and set the entry properties.
   */
  const hasActiveSession = !!req.cookies.sessionId;

  const { organizationId, projectId, userId, anonymousId, sessionId } = getIdsFromCookies(req.cookies);

  const visitProperties = getVisitInfo({userAgent: event.ga.userAgent, referrer: event.referrer, search: event.ga.search}, { isInitialSession });

  posthog.capture({
    distinctId: userId ?? anonymousId,
    event: '$pageview',
    properties: {
        ...visitProperties,
        screen_resolution: event.ga.screen_resolution,
        $locale: event.ga.language,
        $current_url: event.current_url,
        $host: new URL(event.current_url).hostname,
        $pathname: event.route,
        $process_person_profile: !!userId,
        $session_id: sessionId,
        $ip,
        ...(!hasActiveSession && {
          $entry_current_url: event.current_url,
          $entry_pathname: event.route,
          $entry_utm_source: visitProperties.utm_source,
          $entry_utm_medium: visitProperties.utm_medium,
          $entry_utm_campaign: visitProperties.utm_campaign,
          $entry_utm_term: visitProperties.utm_term,
          $entry_utm_content: visitProperties.utm_content,
          $entry_referrer: visitProperties.$referrer,
          $entry_referring_domain: visitProperties.$referring_domain,
        })
    },
    ...(!!organizationId && {
      groups: { organization: organizationId, ...!!projectId && { project: projectId }}
    }),
    sendFeatureFlags: true // For future adoption - we want to send feature flags with every event so that we can use them in event analysis in PostHog.
  });

  res.cookie('sessionId', sessionId, { httpOnly: true, maxAge: THIRTY_MIN_IN_MS, sameSite: 'lax' });
  res.cookie('anonymousId', anonymousId, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });
  
  if(userId) res.cookie('userId', userId, { httpOnly: true, maxAge: THIRTY_MIN_IN_MS, sameSite: 'lax' });
  if(organizationId) res.cookie('organizationId', organizationId, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });
  if(projectId) res.cookie('projectId', projectId, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });

  res.status(200).send('Page view tracked');
})

app.post('/telemetry/pageleave', (req, res) => {
  const event = req.body;
  const $ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const { organizationId, projectId, userId, anonymousId, sessionId } = getIdsFromCookies(req.cookies);

  posthog.capture({
    distinctId: userId ?? anonymousId,
    event: '$pageleave',
    properties: {
        $current_url: event.current_url,
        $host: new URL(event.current_url).hostname,
        $pathname: event.route,
        $exit_current_url: event.current_url,
        $exit_pathname: event.route,
        $process_person_profile: !!userId,
        $session_id: sessionId,
        $ip,
    },
    ...(!!organizationId && {
      groups: { organization: organizationId, ...!!projectId && { project: projectId }}
    }),
    sendFeatureFlags: true, // For future adoption - we want to send feature flags with every event so that we can use them in event analysis in PostHog.
  });

  res.status(200).send('Page leave tracked');
})

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

const shutdown = async () => {
  console.log('Shutting down gracefully...');
  
  // Stop pending pollers and flush any remaining events
  await posthog.shutdown();
  
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forcing shutdown after timeout.');
    process.exit(1);
  }, 5000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown); 