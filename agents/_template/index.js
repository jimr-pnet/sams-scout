const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Agent template is running' });
});

const meta = {
  name: 'template',
  description: 'Agent template — copy this directory to create a new agent',
  basePath: '/api/template',
};

module.exports = { router, meta };
