CREATE TABLE health_metadata (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_global_update TEXT NOT NULL
);

INSERT INTO health_metadata (id, last_global_update)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE health_cache (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('app', 'plugin')),
  entity_key TEXT NOT NULL,
  result_json TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_key)
);

CREATE TABLE health_discovery (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data_json TEXT NOT NULL
);

CREATE TABLE health_discovery_lease (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  owner TEXT,
  expires_at INTEGER NOT NULL
);

INSERT INTO health_discovery_lease (id, owner, expires_at) VALUES (1, NULL, 0);
