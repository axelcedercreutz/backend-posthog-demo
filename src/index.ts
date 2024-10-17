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
  personalApiKey: process.env.PH_PERSONAL_API_KEY,
  featureFlagsPollingInterval: 3000,
  disableGeoip: false
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

app.get('/telemetry/feature-flags', async (req, res) => {
  const { user_id, anonymous_id,  organization_slug, project_ref } = getIdsFromCookies(req.cookies);
  const flagsWithPayloads = await posthog.getAllFlagsAndPayloads(user_id ?? anonymous_id, {
    ...(user_id && { personProperties: { gotrueId: user_id }}),
    groups: { ...!!organization_slug && {organization: organization_slug}, ...!!project_ref && { project: project_ref }}
  });
  res.json(flagsWithPayloads);
})

app.post('/telemetry/feature-flags/track', async (req, res) => {
  const { user_id, anonymous_id, organization_slug, project_ref } = getIdsFromCookies(req.cookies);
  posthog.capture({
    event: '$feature_flag_called',
    distinctId: user_id ?? anonymous_id, 
    groups: { ...!!organization_slug && {organization: organization_slug}, ...!!project_ref && { project: project_ref }},
    sendFeatureFlags: true,
  });
  res.status(200).send('Feature flag tracked');
})

app.post('/telemetry/identify', (req, res) => {
    const { user_id, organization_slug, project_ref } = req.body;

    posthog.identify({
        distinctId: user_id,
        properties: {
          gotrueId: user_id,
        }
    });
    res.cookie('user_id', user_id, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });
    
    const anonymous_id = req.cookies.anonymous_id;
    if(!!anonymous_id)
    posthog.alias({
        distinctId: user_id,
        alias: anonymous_id,
    })
    if(!!organization_slug){
      posthog.groupIdentify({
        distinctId: user_id,
        groupType: 'organization',
        groupKey: organization_slug,
        properties: {
          organizationSlug: organization_slug
        }
      })
      res.cookie('organization_slug', organization_slug, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });
    }

    if(!!project_ref){
      posthog.groupIdentify({
        distinctId: user_id,
        groupType: 'project',
        groupKey: project_ref,
        properties: {
          projectRef: project_ref
        }
      })
      res.cookie('project_ref', project_ref, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });
    }

    res.status(200).send('Identified');
})

app.post('/telemetry/reset', (req, res) => {
  res.clearCookie('user_id');
  res.clearCookie('organization_slug');
  res.clearCookie('project_ref');
  res.clearCookie('anonymous_id');
  res.clearCookie('session_id');
  res.status(200).send('Reset');
})

app.post('/telemetry/groups/identify', (req, res) => {
  const { organization_slug, project_ref } = req.body;

  const user_id = req.cookies.user_id;
  if(!user_id) return;

  if(!!organization_slug) {
    posthog.groupIdentify({
      distinctId: user_id,
      groupType: 'organization',
      groupKey: organization_slug,
      properties: {
        organizationSlug: organization_slug
      }
    });
    res.cookie('organization_slug', organization_slug, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });
  }
  if(!!project_ref) {
    posthog.groupIdentify({
      distinctId: user_id,
      groupType: 'project',
      groupKey: project_ref,
      properties: {
        projectRef: project_ref
      }
    });
    res.cookie('project_ref', project_ref, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });
  }
})

app.post('/telemetry/groups/reset', (req, res) => {
  const { reset_organization, reset_project } = req.body;
  if(reset_organization) res.clearCookie('organization_slug');
  if(reset_project) res.clearCookie('project_ref');
  res.status(200).send('Groups reset');
})

app.post('/telemetry/event', (req, res) => {
  const { action, page_url, page_title, pathname, ph, custom_properties } = req.body;
  const $ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  const { organization_slug, project_ref, user_id, anonymous_id, session_id } = getIdsFromCookies(req.cookies);
  const visitProperties = getVisitInfo(ph);

  posthog.capture({
    distinctId: user_id ?? anonymous_id,
    event: action,
    properties: {
        $ip,
        page_title: page_title,
        $pathname: pathname,
        $current_url: page_url,
        $host: new URL(page_url).hostname,
        $process_person_profile: !!user_id,
        $session_id: session_id,
        ...visitProperties,
        ...custom_properties
    },
    ...(!!organization_slug && {
      groups: { organization: organization_slug, ...!!project_ref && { project: project_ref }}
    }),
    sendFeatureFlags: true, // For future adoption - we want to send feature flags with every event so that we can use them in event analysis in PostHog.
  });

  res.cookie('session_id', session_id, { httpOnly: true, maxAge: THIRTY_MIN_IN_MS, sameSite: 'lax' });
  res.cookie('anonymous_id', anonymous_id, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });

  if(user_id) res.cookie('user_id', user_id, { httpOnly: true, maxAge: THIRTY_MIN_IN_MS, sameSite: 'lax' });
  if(organization_slug) res.cookie('organization_slug', organization_slug, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });
  if(project_ref) res.cookie('project_ref', project_ref, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });

  res.status(200).send('Event tracked');
});

app.post('/telemetry/page', (req, res)=> {
  const { page_url, page_title, pathname, ph } = req.body;
  const $ip = (req.headers.host === 'localhost' || '127.0.0.1') ? undefined : req.headers['x-forwarded-for'] ?? req.socket.remoteAddress;

  /**
   * We need to check if this is the initial (i.e. first ever) session for the user. If it is, we need to set additional initial user properties.
   */
  const isInitialSession = !req.cookies.session_id && !req.cookies.anonymous_id && !req.cookies.user_id;

  /**
   * We need to check if the user has an active session. If not, we need to generate a new session ID and set the entry properties.
   */
  const hasActiveSession = !!req.cookies.session_id;

  const { organization_slug, project_ref, user_id, anonymous_id, session_id } = getIdsFromCookies(req.cookies);

  const visitProperties = getVisitInfo(ph, { isInitialSession });

  posthog.capture({
    distinctId: user_id ?? anonymous_id,
    event: '$pageview',
    properties: {
        $ip,
        page_title,
        $pathname: pathname,
        $current_url: page_url,
        $host: new URL(page_url).hostname,
        $process_person_profile: !!user_id,
        $session_id: session_id,
        ...visitProperties,
        ...(!hasActiveSession && {
          $entry_current_url: page_url,
          $entry_pathname: pathname,
          $entry_utm_source: visitProperties.utm_source,
          $entry_utm_medium: visitProperties.utm_medium,
          $entry_utm_campaign: visitProperties.utm_campaign,
          $entry_utm_term: visitProperties.utm_term,
          $entry_utm_content: visitProperties.utm_content,
          $entry_referrer: visitProperties.$referrer,
          $entry_referring_domain: visitProperties.$referring_domain,
        })
    },
    ...(!!organization_slug && {
      groups: { organization: organization_slug, ...!!project_ref && { project: project_ref }}
    }),
    sendFeatureFlags: true // For future adoption - we want to send feature flags with every event so that we can use them in event analysis in PostHog.
  });

  res.cookie('session_id', session_id, { httpOnly: true, maxAge: THIRTY_MIN_IN_MS, sameSite: 'lax' });
  res.cookie('anonymous_id', anonymous_id, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });
  
  if(user_id) res.cookie('user_id', user_id, { httpOnly: true, maxAge: THIRTY_MIN_IN_MS, sameSite: 'lax' });
  if(organization_slug) res.cookie('organization_slug', organization_slug, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });
  if(project_ref) res.cookie('project_ref', project_ref, { httpOnly: true, maxAge: YEAR_IN_MS, sameSite: 'lax' });

  res.status(200).send('Page view tracked');
})

app.post('/telemetry/pageleave', (req, res) => {
  const { page_url, page_title, pathname } = req.body;
  const $ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const { organization_slug, project_ref, user_id, anonymous_id, session_id } = getIdsFromCookies(req.cookies);

  posthog.capture({
    distinctId: user_id ?? anonymous_id,
    event: '$pageleave',
    properties: {
        page_title,
        $current_url: page_url,
        $host: new URL(page_url).hostname,
        $pathname: pathname,
        $exit_current_url: page_url,
        $exit_pathname: pathname,
        $process_person_profile: !!user_id,
        $session_id: session_id,
        $ip,
    },
    ...(!!organization_slug && {
      groups: { organization: organization_slug, ...!!project_ref && { project: project_ref }}
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