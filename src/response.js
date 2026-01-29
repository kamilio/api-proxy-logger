export function sendJsonError(res, status, payload) {
  if (res.headersSent || res.writableEnded) {
    return false;
  }
  res.status(status).json(payload);
  return true;
}
