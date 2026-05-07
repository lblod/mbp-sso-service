const { ACM_INTROSPECTION_URL, ACM_CLIENT_ID, ACM_CLIENT_SECRET } = process.env;

export async function introspectAndValidate(accessToken) {
  if (!ACM_INTROSPECTION_URL) throw new Error('ACM_INTROSPECTION_URL is not configured');

  const body = new URLSearchParams({
    token: accessToken,
    client_id: ACM_CLIENT_ID,
    client_secret: ACM_CLIENT_SECRET,
  });

  let response;
  try {
    response = await fetch(ACM_INTROSPECTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (e) {
    throw new Error(`ACM introspection request failed: ${e.message}`);
  }

  if (!response.ok) {
    throw new Error(`ACM introspection endpoint returned ${response.status}`);
  }

  const introspection = await response.json();

  if (!introspection.active) {
    throw new Error('Token is not active');
  }

  const now = Math.floor(Date.now() / 1000);
  if (introspection.exp && introspection.exp < now) {
    throw new Error('Token is expired');
  }

  const audiences = Array.isArray(introspection.aud) ? introspection.aud : [introspection.aud];
  if (!audiences.includes(ACM_CLIENT_ID)) {
    throw new Error('Token audience does not match client ID');
  }

  return {
    sub: introspection.sub,
    preferred_username: introspection.preferred_username,
    given_name: introspection.given_name,
    family_name: introspection.family_name,
    email: introspection.email,
  };
}
