
const IoRedis = require('ioredis');
const is = require('is_js');

/**
 * @class Redis
 */
class Redis {
  /**
   * @param {string} name - unique name to this service
   * @param {EventEmitter} emitter
   * @param {Object} config - configuration object of service
   */
  constructor(name, emitter, config) {
    this.name = name;
    this.emitter = emitter;
    this.config = Object.assign({
      host: 'localhost',
      port: 6379,
      db: 0,
    }, config, {
      auth: Object.assign({
        use: false,
      }, config.auth),
      cluster: Object.assign({
        use: false,
      }, config.cluster),
    });
    this.client = null;
  }

  log(message, data) {
    this.emitter.emit('log', {
      service: this.name,
      message,
      data,
    });
  }

  success(message, data) {
    this.emitter.emit('success', {
      service: this.name, message, data,
    });
  }

  error(err, data) {
    this.emitter.emit('error', {
      service: this.name,
      data,
      err,
    });
  }


  /**
   * Connect to redis server with the config
   *
   * @return {Promise<this, Error>} resolves with the instance itself
   *  rejects when can not connect after retires
   */
  init() {
    if (this.client) {
      return Promise.resolve(this);
    }

    // try to make the connection
    return new Promise((resolve, reject) => {
      let client = null;
      const { config } = this;
      const { host, port, db, cluster, auth } = config;
      const infoObj = {};

      if (cluster.use === true) {
        // if we have to user cluster
        Object.assign(infoObj, {
          mode: 'CLUSTER',
          hosts: cluster.hosts,
        });
        const clusterOptions = {
          clusterRetryStrategy(times) {
            if (times > 10) {
              reject();
              return 'Retried 10 times';
            }
            const delay = Math.min(times * 200, 2000);
            return delay;
          },
        };

        if (auth.use === true) {
          Object.assign(infoObj, {
            authentication: 'TRUE',
          });
          clusterOptions.password = auth.password;
        } else {
          Object.assign(infoObj, {
            authentication: 'FALSE',
          });
        }
        client = new IoRedis.Cluster(config.cluster.hosts, clusterOptions);

        // cluster specific events
        client.on('node error', (err) => {
          this.error(err, {
            type: 'node error',
          });
        });
        client.on('+node', (node) => {
          const message = `node added ${node.options.key}`;
          this.log(message, {
            key: node.options.key,
          });
        });
        client.on('-node', (node) => {
          const error = new Error(`node removed ${node.options.key}`);
          this.error(error, {
            key: node.options.key,
          });
        });

        // cluster finish
      } else {
        // single node
        Object.assign(infoObj, {
          mode: 'SINGLE',
          host,
          port,
          db,
        });
        const options = {
          port,
          host,
          db,
          retryStrategy: (times) => {
            if (times > 10) {
              reject();
              return 'Retried 10 times';
            }
            const delay = Math.min(times * 200, 2000);
            return delay;
          },
          reconnectOnError: () => {
            return true;
          },
        };
        if (auth.use === true) {
          Object.assign(infoObj, {
            authentication: 'TRUE',
          });
          options.password = auth.password;
        } else {
          Object.assign(infoObj, {
            authentication: 'FALSE',
          });
        }

        client = new IoRedis(options);
        // single node finish
      }

      this.log(`Connecting in ${infoObj.mode} mode`, infoObj);

      // common events
      client.on('connect', () => {
        this.success(`Successfully connected in ${infoObj.mode} mode`);
      });
      client.on('error', (err) => {
        this.error(err, {});
      });
      client.on('ready', () => {
        this.client = client;
        resolve(this);
      });
      client.on('close', () => {
        const error = new Error('Redis connection closed');
        this.error(error);
      });
      client.on('reconnecting', () => {
        this.log(`Reconnecting in ${infoObj.mode} mode`, infoObj);
      });
      client.on('end', () => {
        this.error(new Error('Connection ended'));
      });
    });
  }


  /**
   * Parse the results of multi and pipeline operations from redis
   * Because of the way IoRedis handles them and return responses
   */
  parse(result) { // eslint-disable-line
    result.forEach((res) => {
      if (is.existy(res[0])) {
        throw new Error(res[0], 'redis.multi', null);
      }
    });
    return result.map(res => res[1]);
  }
}

module.exports = Redis;
