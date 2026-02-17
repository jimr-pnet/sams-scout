const fs = require('fs');
const path = require('path');
const logger = require('../lib/logger');

function registerAgents(app) {
  const agentsDir = path.join(__dirname);
  const entries = fs.readdirSync(agentsDir, { withFileTypes: true });

  const agents = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_')) continue;

    const agentPath = path.join(agentsDir, entry.name);
    try {
      const agent = require(agentPath);

      if (!agent.router || !agent.meta) {
        logger.warn(`Agent "${entry.name}" missing router or meta, skipping`);
        continue;
      }

      app.use(agent.meta.basePath, agent.router);
      agents.push(agent.meta);
      logger.info(`Agent registered: ${agent.meta.name} at ${agent.meta.basePath}`);
    } catch (err) {
      logger.error(`Failed to load agent "${entry.name}"`, { error: err.message });
    }
  }

  app.get('/api/agents', (req, res) => {
    res.json({ agents });
  });
}

module.exports = registerAgents;
