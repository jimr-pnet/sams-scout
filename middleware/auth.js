function auth(req, res, next) {
  const expectedKey = process.env.API_KEY;
  if (!expectedKey) {
    return next();
  }

  const apiKey = req.headers['x-api-key']
    || (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    || req.query.api_key;

  if (!apiKey || apiKey !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

module.exports = auth;
