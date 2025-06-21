/**
 * Health dashboard client-side logic
 */

async function fetchHealthData() {
  try {
    const response = await fetch('/api/services');
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

async function checkServiceHealth(domain) {
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

async function renderServices(services, plugins) {
  const servicesGrid = document.getElementById('services-grid');
  const pluginsGrid = document.getElementById('plugins-grid');
  const othersGrid = document.getElementById('others-grid');
  servicesGrid.innerHTML = '';
  pluginsGrid.innerHTML = '';
  othersGrid.innerHTML = '';

  const pluginNames = new Set(plugins.map(p => p.name));

  for (const service of services) {
    let targetGrid;
    if (pluginNames.has(service)) {
      continue; // Skip plugins, they are rendered separately
    } else if (service.startsWith('os-')) {
      targetGrid = othersGrid;
    }
    else {
      targetGrid = servicesGrid;
    }

    const health = await checkServiceHealth(service);
    const card = document.createElement('div');
    card.className = 'service-card';

    card.innerHTML = `
      <div class="card-header">
        <div class="card-title"><a href="https://${service ? service + '.ubq.fi' : 'ubq.fi'}" target="_blank">${service ? service + '.ubq.fi' : 'ubq.fi'}</a></div>
        <div class="status-indicator ${health.healthy ? 'status-healthy' : 'status-unhealthy'}"></div>
      </div>
      <div class="card-domain"><a href="https://${service ? service + '.ubq.fi' : 'ubq.fi'}" target="_blank">${service ? service + '.ubq.fi' : 'ubq.fi'}</a></div>
      <div class="card-details">
        <div class="detail-item">
          <span class="detail-label">Status:</span>
          <span class="detail-value">${health.healthy ? 'Healthy' : 'Unhealthy'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Last Check:</span>
          <span class="detail-value">${new Date(health.timestamp).toLocaleTimeString()}</span>
        </div>
        ${!health.healthy ? `
        <div class="detail-item" style="grid-column: span 2;">
          <span class="detail-label">Error:</span>
          <span class="detail-value">${health.error}</span>
        </div>` : ''}
      </div>
    `;

    targetGrid.appendChild(card);
  }
}

async function renderPlugins(plugins = []) {
  const grid = document.getElementById('plugins-grid');
  grid.innerHTML = '';

  plugins.forEach(async (plugin) => {
    const health = await checkServiceHealth(plugin.routingDomain);
    const card = document.createElement('div');
    card.className = 'plugin-card';

    card.innerHTML = `
      <div class="card-header">
        <div class="card-title"><a href="https://${plugin.routingDomain}" target="_blank">${plugin.displayName}</a></div>
        <div class="status-indicator ${health.healthy ? 'status-healthy' : 'status-unhealthy'}"></div>
      </div>
      <div class="card-domain"><a href="https://${plugin.routingDomain}" target="_blank">${plugin.routingDomain}</a></div>
      <div class="card-details">
        <div class="detail-item">
          <span class="detail-label">Status:</span>
          <span class="detail-value">${health.healthy ? 'Healthy' : 'Unhealthy'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Description:</span>
          <span class="detail-value">${plugin.description}</span>
        </div>
        ${!health.healthy ? `
        <div class="detail-item" style="grid-column: span 2;">
          <span class="detail-label">Error:</span>
          <span class="detail-value">${health.error}</span>
        </div>` : ''}
      </div>
    `;

    grid.appendChild(card);
  });
}

async function renderOthers(others = []) {
  const grid = document.getElementById('others-grid');
  grid.innerHTML = '';

  others.forEach(async (other) => {
    const health = await checkServiceHealth(other);
    const card = document.createElement('div');
    card.className = 'service-card';

    card.innerHTML = `
      <div class="card-header">
        <div class="card-title"><a href="https://${other ? other + '.ubq.fi' : 'ubq.fi'}" target="_blank">${other ? other + '.ubq.fi' : 'ubq.fi'}</a></div>
        <div class="status-indicator ${health.healthy ? 'status-healthy' : 'status-unhealthy'}"></div>
      </div>
      <div class="card-domain"><a href="https://${other ? other + '.ubq.fi' : 'ubq.fi'}" target="_blank">${other ? other + '.ubq.fi' : 'ubq.fi'}</a></div>
      <div class="card-details">
        <div class="detail-item">
          <span class="detail-label">Status:</span>
          <span class="detail-value">${health.healthy ? 'Healthy' : 'Unhealthy'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Last Check:</span>
          <span class="detail-value">${new Date(health.timestamp).toLocaleTimeString()}</span>
        </div>
        ${!health.healthy ? `
        <div class="detail-item" style="grid-column: span 2;">
          <span class="detail-label">Error:</span>
          <span class="detail-value">${health.error}</span>
        </div>` : ''}
      </div>
    `;

    grid.appendChild(card);
  });
}

async function updateDashboard() {
  document.getElementById('loading').style.display = 'block';
  document.getElementById('content').style.display = 'none';

  const data = await fetchHealthData();
  if (!data) return;

  await renderServices(data.services || [], data.plugins || []);
  await renderPlugins(data.plugins || []);

  // Use a timeout to ensure all cards are rendered before calculating summary
  setTimeout(() => {
    // Count healthy services/plugins
    const healthyServices = document.querySelectorAll('#services-grid .status-healthy').length;
    const healthyPlugins = document.querySelectorAll('#plugins-grid .status-healthy').length;
    const healthyOthers = document.querySelectorAll('#others-grid .status-healthy').length;
    const totalServices = document.querySelectorAll('#services-grid .service-card').length;
    const totalPlugins = (data.plugins || []).length;
    const totalOthers = document.querySelectorAll('#others-grid .service-card').length;


    // Update summary
    document.getElementById('services-count').textContent =
      `${healthyServices}/${totalServices}`;
    document.getElementById('plugins-count').textContent =
      `${healthyPlugins}/${totalPlugins}`;
    document.getElementById('others-count').textContent =
      `${healthyOthers}/${totalOthers}`;
    document.getElementById('overall-health').textContent =
      `${Math.round((healthyServices + healthyPlugins + healthyOthers) / (totalServices + totalPlugins + totalOthers) * 100)}%`;
    document.getElementById('last-updated').textContent =
      new Date(data.timestamp).toLocaleString();

    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
  }, 1000);
}

// Initial load
updateDashboard();

// Refresh every 5 minutes
setInterval(updateDashboard, 5 * 60 * 1000);
