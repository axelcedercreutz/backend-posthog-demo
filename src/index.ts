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

const posthog = new PostHog(process.env.PH_API_KEY ?? '', {
  host: process.env.PH_HOST,
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
    const { user } = req.body;

    const distinctId = user.id;

    posthog.identify({
        distinctId,
    });
    res.cookie('userId', distinctId, { httpOnly: true, maxAge: 3600000 * 24 * 180, sameSite: 'lax' });
    
    const anonymousId = req.cookies.anonymousId;
    if(!!anonymousId)
    posthog.alias({
        distinctId,
        alias: anonymousId,
    })

    const firstUserOrganization = user.organizations[0];
    if(!!firstUserOrganization){
      posthog.groupIdentify({
        distinctId,
        groupType: 'organization',
        groupKey: firstUserOrganization.id,
      })
      res.cookie('organizationId', firstUserOrganization.id, { httpOnly: true, maxAge: 3600000 * 24 * 180, sameSite: 'lax' });
    }
    if(!!firstUserOrganization?.projects.length){
      posthog.groupIdentify({
        distinctId,
        groupType: 'project',
        groupKey: firstUserOrganization.projects[0].id,
      })
      res.cookie('projectId', firstUserOrganization.projects[0].id, { httpOnly: true, maxAge: 3600000 * 24 * 180, sameSite: 'lax' });
    }
    res.status(200).send('Identified');
})

app.post('/telemetry/event', (req, res) => {
  const {action, ...rest } = req.body;
  const { organizationId, projectId, userId, anonymousId, sessionId } = getIdsFromCookies(req.cookies);

  posthog.capture({
    distinctId: userId ?? anonymousId,
    event: action,
    properties: {
        ...rest,
        $current_url: rest.page_title,
        $process_person_profile: !!userId,
        $session_id: sessionId,
    },
    sendFeatureFlags: true,
    ...(!!organizationId && {groups: { organization: organizationId, ...!!projectId && { project: projectId }}})
  });

  res.cookie('sessionId', sessionId, { httpOnly: true, maxAge: 3600000 / 2, sameSite: 'lax' });
  res.cookie('anonymousId', anonymousId, { httpOnly: true, maxAge: 3600000 * 24 * 180, sameSite: 'lax' });
  res.status(200).send('Event tracked');
});

app.post('/telemetry/page', (req, res)=> {
  const event = req.body;

  const { organizationId, projectId, userId, anonymousId, sessionId } = getIdsFromCookies(req.cookies);

  const properties = getVisitInfo({userAgent: event.ga.user_agent, referrer: event.referrer, search: event.ga.search});

  posthog.capture({
    distinctId: userId ?? anonymousId,
    event: '$pageview',
    properties: {
        ...properties,
        screen_resolution: event.ga.screen_resolution,
        $current_url: event.current_url,
        $pathname: event.route,
        $process_person_profile: !!userId,
        $session_id: sessionId,
    },
    ...(!!organizationId && {groups: { organization: organizationId, ...!!projectId && { project: projectId }}})
  });

  res.cookie('sessionId', sessionId, { httpOnly: true, maxAge: 3600000 / 2, sameSite: 'lax' });
  res.cookie('anonymousId', anonymousId, { httpOnly: true, maxAge: 3600000 * 24 * 180, sameSite: 'lax' });
  res.status(200).send('Page view tracked');
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