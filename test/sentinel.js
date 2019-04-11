

const Redis = require('../index.js');
const { EventEmitter } = require('events');

const emitter = new EventEmitter();
emitter.on('log', console.log.bind(console));
emitter.on('success', console.log.bind(console));
emitter.on('error', console.error.bind(console));

async function doSome(client) {
  for (let i = 0; i < 10000; i += 1) {
    console.log(i);
    await client.set(`Key:${i}`, i);
  }
}

const redis = new Redis('redis', emitter, {
  sentinel: {
    use: true,
    hosts: [{
      host: 'localhost',
      port: 5000,
    }, {
      host: 'localhost',
      port: 5001,
    }, {
      host: 'localhost',
      port: 5002,
    }],
    name: 'mymaster',
  },
});
redis.init()
  .then(() => {
    const client = redis.client;
    return doSome(client);
  })
  .then(() => {
    console.log('Started');
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
