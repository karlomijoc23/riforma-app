import * as Sentry from "@sentry/react";

export const initSentry = () => {
  const dsn = process.env.REACT_APP_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
  });
};

export const captureException = (error, context) => {
  if (process.env.REACT_APP_SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  }
  console.error(error, context);
};

export const captureMessage = (message, level = "info") => {
  if (process.env.REACT_APP_SENTRY_DSN) {
    Sentry.captureMessage(message, level);
  }
};
