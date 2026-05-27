import { app, errorHandler } from 'mu';
import cookieParser from 'cookie-parser';
import { introspectAndValidate } from './lib/acm.js';
import { storeHandoverToken, redeemHandoverToken } from './lib/handover.js';
import { ensureUserAccount, createSession, deleteSession, getSessionInfo } from './lib/session.js';
import express from 'express';

app.use(cookieParser());
app.use(express.json());

// Called by MBP backend: exchange ACM access token for a short-lived handover token.
app.post('/auth/v1/token', async function(req, res) {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Missing token' });
  }

  let userInfo;
  try {
    userInfo = await introspectAndValidate(token);
  } catch (e) {
    console.warn('ACM token validation failed:', e.message);
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const accountUri = await ensureUserAccount(userInfo);
    // ACM access token is stored inside the handover record and never sent to the frontend.
    const handoverToken = storeHandoverToken({ accessToken: token, userInfo, accountUri });
    console.log(`Handover token issued for subject ${userInfo.sub}`);
    return res.status(200).json({ token: handoverToken });
  } catch (e) {
    console.error('Failed to issue handover token:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Called by the embed frontend on page load to restore an existing session.
app.get('/auth/v1/session', async function(req, res) {
  const sessionUri = req.headers['mu-session-id'];
  if (!sessionUri) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const info = await getSessionInfo(sessionUri);
    if (!info) return res.status(401).json({ error: 'Not authenticated' });

    return res.status(200).json({
      data: {
        type: 'sessions',
        attributes: { firstName: info.firstName, lastName: info.lastName },
      },
    });
  } catch (e) {
    console.error('Failed to get session info:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Called by the embed frontend: redeem a handover token and start an authenticated session.
app.post('/auth/v1/exchange', async function(req, res) {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Missing handover token' });
  }

  const tokenData = redeemHandoverToken(token);
  if (!tokenData) {
    return res.status(401).json({ error: 'Invalid or expired handover token' });
  }

  const sessionUri = req.headers['mu-session-id'];
  if (!sessionUri) {
    return res.status(500).json({ error: 'No session URI from mu-identifier' });
  }

  try {
    await createSession(sessionUri, tokenData.accountUri);

    console.log(`Session created for subject ${tokenData.userInfo.sub}`);

    return res.status(201).json({
      data: {
        type: 'sessions',
        attributes: {
          firstName: tokenData.userInfo.given_name,
          lastName: tokenData.userInfo.family_name,
        },
      },
    });
  } catch (e) {
    console.error('Failed to create session:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Called by the embed frontend on logout.
app.delete('/auth/v1/session', async function(req, res) {
  const sessionUri = req.headers['mu-session-id'];

  if (sessionUri) {
    try {
      await deleteSession(sessionUri);
    } catch (e) {
      console.error('Failed to remove session from triplestore:', e);
    }
  }

  res.clearCookie('mu_session_id');
  return res.status(204).send();
});

app.use(errorHandler);
