function toBase64Url(data: { [key: string]: any }) {
  const jsonStr = JSON.stringify(data);
  return Buffer.from(jsonStr).toString("base64url");
}

export function generateTokens(username: string, uuid: string) {
  const header = { alg: "EdDSA" };
  const headerB64 = toBase64Url(header);

  // PAYLOAD IDENTITY
  const identityData = {
    sub: uuid,
    name: username,
    scope: "hytale:client hytale:server",
  };
  const identityToken = `${headerB64}.${toBase64Url(identityData)}.fake_signature`;

  // PAYLOAD SESSION
  const sessionData = {
    sub: uuid,
    scope: "hytale:server",
  };
  const sessionToken = `${headerB64}.${toBase64Url(sessionData)}.fake_signature`;

  return { identityToken, sessionToken };
}
