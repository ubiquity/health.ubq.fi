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

async function renderServices(services) {
  const grid = document.getElementById('services-grid');
  grid.innerHTML = '';

  for (const service of services) {
    const health = await checkServiceHealth(service);
    const card = document.createElement('div');
    card.className = 'service-card';
    
    card.innerHTML = `
      <div class="card-header">
        <div class="card-title">${service || 'root'}.ubq.fi</div>
        <div class="status-indicator ${health.healthy ? 'status-healthy' : 'status-unhealthy'}"></div>
      </div>
      <div class="card-domain">${service ? service + '.' : ''}ubq.fi</div>
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
  }
}

async function renderPlugins(plugins) {
  const grid = document.getElementById('plugins-grid');
  grid.innerHTML = '';

  for (const plugin of plugins) {
    const health = await checkServiceHealth(plugin.routingDomain);
    const card = document.createElement('div');
    card.className = 'plugin-card';
    
    card.innerHTML = `
      <div class="card-header">
        <div class="card-title">${plugin.displayName}</div>
        <div class="status-indicator ${health.healthy ? 'status-healthy' : 'status-unhealthy'}"></div>
      </div>
      <div class="card-domain">${plugin.routingDomain}</div>
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
  }
}

async function updateDashboard() {
  document.getElementById('loading').style.display = 'block';
  document.getElementById('content').style.display = 'none';
  
  const data = await fetchHealthData();
  if (!data) return;

  const services = await renderServices(data.services);
  const plugins = await renderPlugins(data.plugins);
  
  // Count healthy services/plugins
  const healthyServices = document.querySelectorAll('.status-healthy').length;
  const healthyPlugins = document.querySelectorAll('.status-healthy').length - healthyServices;
  
  // Update summary
  document.getElementById('services-count').textContent =
    `${healthyServices}/${data.services.length}`;
  document.getElementById('plugins-count').textContent =
    `${healthyPlugins}/${data.plugins.length}`;
  document.getElementById('overall-health').textContent =
    `${Math.round((healthyServices + healthyPlugins) / (data.services.length + data.plugins.length) * 100)}%`;
  document.getElementById('last-updated').textContent = 
    new Date(data.timestamp).toLocaleString();
  document.getElementById('overall-health').textContent =
    `${Math.round((healthyServices + healthyPlugins) / (data.services.length + data.plugins.length) * 100)}%`;
  
  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'block';
}

// Initial load
updateDashboard();

// Refresh every 5 minutes
setInterval(updateDashboard, 5 * 60 * 1000);
