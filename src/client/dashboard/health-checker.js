/**
 * Health dashboard client-side logic
 */

async function fetchHealthData() {
  try {
    const response = await fetch('/api/apps');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch health data:', error);
    document.getElementById('error').textContent =
      `Failed to load health data: ${error.message}`;
    document.getElementById('error').style.display = 'block';
    return null;
  }
}

async function checkAppHealth(domain) {
  try {
    const response = await fetch(`/api/health/${domain || 'root'}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Health check failed for ${domain}:`, error);
    return {
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

function renderCard(grid, item, health, isPlugin = false) {
  const card = document.createElement('div');
  card.className = isPlugin ? 'plugin-card' : 'app-card';

  const title = isPlugin ? item.displayName : (item ? item + '.ubq.fi' : 'ubq.fi');
  const domain = isPlugin ? item.routingDomain : (item ? item + '.ubq.fi' : 'ubq.fi');
  const description = isPlugin ? item.description : `Last Check: ${new Date(health.timestamp).toLocaleTimeString()}`;
  const descriptionLabel = isPlugin ? 'Description:' : 'Last Check:';

  card.innerHTML = `
    <div class="card-header">
      <div class="card-title"><a href="https://${domain}" target="_blank">${title}</a></div>
      <div class="status-indicator ${health.healthy ? 'status-healthy' : 'status-unhealthy'}"></div>
    </div>
    <div class="card-domain"><a href="https://${domain}" target="_blank">${domain}</a></div>
    <div class="card-details">
      <div class="detail-item">
        <span class="detail-label">Status:</span>
        <span class="detail-value">${health.healthy ? 'Healthy' : 'Unhealthy'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">${descriptionLabel}</span>
        <span class="detail-value">${description}</span>
      </div>
      ${!health.healthy ? `
      <div class="detail-item" style="grid-column: span 2;">
        <span class="detail-label">Error:</span>
        <span class="detail-value">${health.error}</span>
      </div>` : ''}
    </div>
  `;
  grid.appendChild(card);
}

async function updateDashboard() {
  document.getElementById("loading").style.display = "block";
  document.getElementById("content").style.display = "none";
  document.getElementById("error").style.display = "none";

  const appsGrid = document.getElementById("apps-grid");
  const pluginsGrid = document.getElementById("plugins-grid");
  appsGrid.innerHTML = "";
  pluginsGrid.innerHTML = "";

  const data = await fetchHealthData();
  if (!data) {
    document.getElementById("loading").style.display = "none";
    return;
  }

  document.getElementById("loading").style.display = "none";
  document.getElementById("content").style.display = "block";
  document.getElementById(
    "last-updated"
  ).textContent = new Date().toLocaleString();

  const { apps = [], plugins = [] } = data;

  // Process all os-prefixed domains as plugins
  const osPlugins = apps
    .filter((app) => app.startsWith("os-"))
    .map((name) => ({
      name,
      displayName: name.replace(/^os-/, "").replace(/-/g, " "),
      routingDomain: `${name}.ubq.fi`,
      description: "Operating System Plugin",
    }));

  const allPlugins = [...plugins, ...osPlugins];
  const pluginNames = new Set(allPlugins.map((p) => p.name));
  const regularApps = apps.filter((app) => !pluginNames.has(app));

  const totalAppsCount = regularApps.length;
  const totalPluginsCount = allPlugins.length;

  const updateAllCounts = () => {
    const healthyApps = document.querySelectorAll(
      "#apps-grid .status-healthy"
    ).length;
    const healthyPlugins = document.querySelectorAll(
      "#plugins-grid .status-healthy"
    ).length;
    const totalHealthy = healthyApps + healthyPlugins;
    const totalServices = totalAppsCount + totalPluginsCount;
    document.getElementById(
      "apps-count"
    ).textContent = `${healthyApps}/${totalAppsCount}`;
    document.getElementById(
      "plugins-count"
    ).textContent = `${healthyPlugins}/${totalPluginsCount}`;
    document.getElementById("overall-health").textContent = `${totalServices > 0
        ? Math.round((totalHealthy / totalServices) * 100)
        : 0
      }%`;
  };

  updateAllCounts();

  regularApps.forEach((app) => {
    checkAppHealth(app).then((health) => {
      renderCard(appsGrid, app, health);
      updateAllCounts();
    });
  });

  allPlugins.forEach((plugin) => {
    checkAppHealth(plugin.routingDomain).then((health) => {
      renderCard(pluginsGrid, plugin, health, true);
      updateAllCounts();
    });
  });
}

// Initial load
updateDashboard();

// Refresh every 5 minutes
setInterval(updateDashboard, 5 * 60 * 1000);
