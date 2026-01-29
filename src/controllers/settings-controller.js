import { loadConfig } from '../config.js';
import { renderViewerSettings } from '../viewer.js';
import { setConfigValue, addAliasToConfig, removeAliasFromConfig, setDefaultAliasInConfig } from '../config-aliases.js';

export function createSettingsController(runtimeConfig) {
  return {
    index: async (req, res) => {
      try {
        const config = loadConfig(true);
        const html = await renderViewerSettings(config, {
          hasExplicitTarget: runtimeConfig?.hasExplicitTarget || false,
          targetAlias: runtimeConfig?.targetAlias || null,
        });
        res.type('html').send(html);
      } catch (error) {
        console.error('Settings page error:', error.message);
        res.status(500).json({ error: 'Settings page error', message: error.message });
      }
    },

    updateSetting: async (req, res) => {
      try {
        const { key, value } = req.body;
        if (!key) {
          res.status(400).json({ error: 'Missing key' });
          return;
        }

        if (key === 'default_alias') {
          if (value === null || value === '') {
            setConfigValue('default_alias', null);
          } else {
            setDefaultAliasInConfig(value);
          }
          res.json({ success: true, key, value });
          return;
        }

        const result = setConfigValue(key, value);
        res.json({ success: true, key: result.key, value: result.value });
      } catch (error) {
        console.error('Update setting error:', error.message);
        res.status(400).json({ error: error.message });
      }
    },

    addAlias: async (req, res) => {
      try {
        const { name, url } = req.body;
        if (!name || !url) {
          res.status(400).json({ error: 'Missing name or url' });
          return;
        }

        const result = addAliasToConfig(name, url);
        res.json({ success: true, alias: result.alias, url: result.url });
      } catch (error) {
        console.error('Add alias error:', error.message);
        res.status(400).json({ error: error.message });
      }
    },

    deleteAlias: async (req, res) => {
      try {
        const { name } = req.params;
        if (!name) {
          res.status(400).json({ error: 'Missing alias name' });
          return;
        }

        const result = removeAliasFromConfig(name);
        res.json({ success: true, alias: result.alias });
      } catch (error) {
        console.error('Delete alias error:', error.message);
        res.status(400).json({ error: error.message });
      }
    },
  };
}
