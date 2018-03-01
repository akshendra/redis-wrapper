

const Redis = require('./index.js');
const { EventEmitter } = require('events');

const emitter = new EventEmitter();
emitter.on('info', console.log.bind(console));
emitter.on('success', console.log.bind(console));
emitter.on('error', console.error.bind(console));

const redis = new Redis('redis', emitter, {
  host: '127.0.0.2',
  port: 6379,
});
redis.init()
  .then(() => {
    console.log('Started');
  })
  .catch(err => {
    console.error(err);
  });
