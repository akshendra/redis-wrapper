
const IoRedis = require('ioredis');
const { is } = require('@akshendra/misc');
const Service = require('@akshendra/service');
const { validate, joi } = require('@akshendra/validator');

/**
 * @class Redis
 */
class Redis extends Service {
  /**
   * @param {string} name - unique name to this service
   * @param {EventEmitter} emitter
   * @param {Object} config - configuration object of service
   */
  constructor(name, emitter, config) {
    super(name, emitter);

    // validate and set defaults for config
    this.config = validate(config, joi.object().keys({
      host: joi.string().default('127.0.0.1'),
      port: joi.number().integer().min(0).default(6379),
      db: joi.number().integer().min(0).default(0),
      auth: joi.object().keys({
        use: joi.bool().default(false),
        password: joi.string().default(''),
      }).default({
        use: false,
      }),
      cluster: joi.object().keys({
        use: joi.bool().default(false),
        hosts: joi.array().items(joi.object().keys({
          host: joi.string().default('127.0.0.1'),
          port: joi.number().integer().min(0).default(6379),
          db: joi.number().integer().min(0).default(0),
          password: joi.string().allow(null).default(null),
        })),
      }).default({
        use: false,
      }),
    }));
    this.client = null;
  }


  /**
   * Connect to redis server with the config
   *
   * @return {Promise<this, Error>} resolves with the instance itself
   *  rejects when can not connect after retires
   */
  init() {
    if (is.not.null(this.client)) {
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
        this.log.info('Redis -> connecting to CLUSTER', cluster.hosts);
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
          this.log.error('node error', err);
          this.emitError('node error', err, {});
        });
        client.on('+node', (node) => {
          const message = `node added ${node.options.key}`;
          this.log.info(message);
          this.emitInfo('node added', message, {
            key: node.options.key,
          });
        });
        client.on('-node', (node) => {
          const error = new Error(`node removed ${node.options.key}`);
          this.log.error(error);
          this.emitError('node removed', error, {
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
            this.log.info('Reconnecting to', host);
            const delay = Math.min(times * 200, 2000);
            return delay;
          },
          reconnectOnError: () => {
            this.log.info('Reconnecting cause of error to', host);
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

        this.log.info('Connecting to URL', options);
        client = new IoRedis(options);
        // single node finish
      }

      this.emitInfo('connecting', `Connecting in ${infoObj.mode} mode`, infoObj);

      // common events
      client.on('connect', () => {
        this.log.info('Connected');
        this.emitSuccess(`Successfully connected in ${infoObj.mode} mode`);
      });
      client.on('error', (err) => {
        this.log.error('error', err);
        this.emitError('client', err, {});
      });
      client.on('ready', () => {
        this.log.info('Ready');
        this.client = client;
        resolve(this);
      });
      client.on('close', () => {
        const error = new Error('Redis connection closed');
        this.log.error('Closed');
        this.emitError('client', error);
      });
      client.on('reconnecting', () => {
        this.log.info('reconnecting');
        this.emitInfo('reconnecting', `Reconnecting in ${infoObj.mode} mode`, infoObj);
      });
      client.on('end', () => {
        this.log.error('Ended');
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
