

const Redis = require('../index.js');
const { EventEmitter } = require('events');

const emitter = new EventEmitter();
emitter.on('log', console.log.bind(console));
emitter.on('success', console.log.bind(console));
emitter.on('error', console.error.bind(console));

async function doSome(client) {
  for (let i = 0; i < 1000; i += 1) {
    console.log(i);
    await client.set(`Key:${i}`, i);
  }
}

async function doPPL(redis) {
  await redis.ppl([{
    command: 'hset',
    args: [
      'Map',
      'one',
      '1',
    ],
  }, {
    command: 'hmset',
    args: [
      'Map',
      { 'two': 2, 'three': 3 },
    ],
  }, {
    command: 'set',
    args: [
      'count',
      '3',
    ],
  }]);
  const response = await redis.ppl([{
    command: 'hgetall',
    args: [
      'Map',
    ],
  }, {
    command: 'get',
    args: [
      'count',
    ],
    action(val) {
      return {
        count: val,
      };
    },
  }]);
  console.log(JSON.stringify(response, null, 2));
}

const redis = new Redis('redis', emitter, {
  host: '127.0.0.1',
  port: 6379,
});
redis.init()
  .then(() => {
    const client = redis.client;
    return doSome(client);
  })
  .then(() => {
    return doPPL(redis);
  })
  .then(() => {
    console.log('Started');
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
