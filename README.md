# kafking

> The king of Kafka, awesome [kafka-avro](https://github.com/waldophotos/kafka-avro) wrapper for your pleasure.

## Install

Install the module using NPM:

```
npm install @waldo/kafking --save
```

## Documentation

### Instantiating and Setting up

Kafking is a Ctor that you need to instantiate and pass the required parameters for it to operate:

```js
const kafking = new Kafking(opts);
```

The options are:

#### Required Options

* `kafkaBroker` {string} **Required** The kafka brokers string.
* `schemaRegistry` {string} **Required** The Schema Registry url.

#### Consumer Options

* `noConsumer` {boolean} Set to true to disable booting a consumer.
* `consumerOpts` {Object} Consumer options, required if `consumerGroup` is not set.
* `consumerGroup` {string} Use default options and just define the consumerGroup.
* `consumerTopics` {Array.<string>} The topics you want to consume on.

The default consumer options are:

```js
{
    'socket.keepalive.enable': true,
    'enable.auto.commit': false,
    'auto.commit.interval.ms': 30000,
}
```

#### Producer Options

* `noProducer` {boolean} Set to true to disable booting a producer.
* `producerOpts` {Object} Producer options.
* `producerTopics` {Array.<Object>} The topics you want to produce on in an array of objects which must have the values:
  * `topicName` {string} The topic canonical name.
  * `topicOpts` {Object} Options to use for the `producer.Topic()` method of node-rdkafka.

The default producer options are:

```js
{
    'dr_cb': true,
}
```

The default producer Topic options are:

```js
{
    // Make the Kafka broker acknowledge our message
    'request.required.acks': 1,
}
```

### Kafking Usage

Once you instantiate the Kafking you need to initialize it so it boots up and connects to the Kafka brokers and Schema Registry endpoint:

```js
kafking.init()
    .bind(this)
    .then(function() {
        console.log('Ready!');
    });
```

> `kafking.init()` returns a bluebird promise.

Once initialized you may start listening on events to consume or use the available Kafka Topics to produce.

There are two crucial properties you need to know about:

* `kafking.consumer` {node-rdkafka.Consumer} The instantiated node-rdkafka Consumer Ctor (if consumer not disabled).
* `kafking.producer` {node-rdkafka.Producer} The instantiated node-rdkafka Producer Ctor (if consumer not disabled).

#### Events Emitted by Kafking

* `*` Use the canonical name of the event to consume messages received on it.
    * `message` {Object} The raw message object as emitted by kafka-avro.
* `data` Raw channel on every message received for every topic.
* `consumer-disconnected` Disconnect event fired from consumer.
    * `arg` {?} Unknown type/value.
* `producer-disconnected` Disconnect event fired from consumer.
    * `arg` {?} Unknown type/value.
* `delivery-report` When delivery reports are activated this is the event to listen on.
    * `error` {Error|null} If an error occurred in delivery.
    * `receipt` {Object} The receipt object.
* `rebalance` Emitted when a rebalance event occurs on the consumer.
    * `event` {Object} The event emitted.

#### Producing with Kafking

Kafking exposes the node-rdkafka `producer` instance in a property with the same name. To produce you just need to invoke the `produce()` method of the producer.

To produce, you will need to define the topic as a string using the exact value you used when you setup the produce topics.

Alternatively you may use the Topic Configuration which is provided by Kafking in the property named `topic` which is an object, with keys, the topic names you want to produce on. These keys contain references to the initialized node-rdkafka `producer.Topic` instance.

```js
// Produce with string literal
kafking.producer.produce('my-topic-name', partition, newMessage, key);

// Produce with Topic Configuration
const topicConf = kafking.topic.MyTopicName;
kafking.producer.produce(topicConf, partition, newMessage, key);
```

## Usage Examples

### Configure for Consumer Usage Only

First configure the kafking instance.

```js
const Kafking = require('@waldo/kafking');

const kafkingOpts = {
    kafkaBroker: '...',
    schemaRegistry: '...',
    noProducer: true,
    consumerGroup: 'myServiceGroup',
    consumerTopics: ['myTopic1', 'myTopic2'],
};

const kafking = new Kafking(kafkingOpts);

kafking.init()
    .bind(this)
    .then(function() {
        // now you are ready to start consuming.
    })
```

Once initialized you can now start consuming on the topics you registered:

```js
kafking.on('myTopic1', function(message) {
    console.log('Received message on topic:', message.topic, 'Value:', message.parsed);
    kafking.consumer.commit(message, function(err) {
        console.log('message committed!');
    })
});

kafking.on('myTopic2', function(message) {
    console.log('Received message on topic:', message.topic, 'Value:', message.parsed);
    kafking.consumer.commit(message, function(err) {
        console.log('message committed!');
    })
});
```

> Kafking provides a promisified version of `commit` as `kafking.consumer.commitAsync()`.

### Configure for Producer Usage Only

First configure the kafking instance.

```js
const Kafking = require('@waldo/kafking');

const kafkingOpts = {
    kafkaBroker: '...',
    schemaRegistry: '...',
    noConsumer: true,
    producerTopics: [{
        topicName: 'myTopic1',
    }, {
        topicName: 'myTopic2',
    }],
};

const kafking = new Kafking(kafkingOpts);

kafking.init()
    .bind(this)
    .then(function() {
        // now you are ready to start producing.
    })
```

Once initialized you can now start producing on the topics you registered:

```js

const message = {
    foo: 'bar',
};


// Produce on "myTopic1" using Topic Configuration:
kafking.producer.produce(kafking.topic.myTopic1, -1, message, 1);

// Produce on "myTopic2" using string literal:
kafking.producer.produce('myTopic2', -1, message, 1);
```

### Logging

To set the logging level of Kafking use the following environment variables before requiring Kafking:

* `KAFKING_LOG_LEVEL` Set it a valid Bunyan log level value to activate console logging (Typically you'd need either `info` or `debug` as values).
* `KAFKING_LOG_NO_COLORS` Set this to any value to disable color when logging.

## Releasing

1. Update the changelog bellow.
1. Ensure you are on master.
1. Type: `grunt release`
    * `grunt release:minor` for minor number jump.
    * `grunt release:major` for major number jump.

## Release History

- **v0.1.0**, *28 Mar 2017*
    - Allow producing with string literals as topics, sugar.
- **v0.0.2**, *01 Mar 2017*
    - Provide a promisified version of `commit` at `consumer.commitAsync()`.
- **v0.0.1**, *24 Feb 2017*
    - Big Bang

## License

Copyright Waldo, Inc. All rights reserved.
