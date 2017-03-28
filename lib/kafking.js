/*
 * Kafking
 * The king of Kafka, awesome kafka-avro wrapper for your pleasure.
 * https://github.com/waldo/node-kafking
 *
 * Copyright © Waldo, Inc.
 * All rights reserved.
 */

const EventEmitter = require('events').EventEmitter;

const cip = require('cip');
const Promise = require('bluebird');
const KafkaAvro = require('kafka-avro');

const log = require('./log.lib').getChild(__filename);

const CeventEmitter = cip.cast(EventEmitter);

/**
 * kafka-avro instance wrapper.
 *
 * @constructor
 * @extends {events.EventEmitter}
 */
const Kafking = module.exports = CeventEmitter.extendSingleton(function(opts) {
  const kafkaOpts = {
    kafkaBroker: opts.kafkaBroker,
    schemaRegistry: opts.schemaRegistry,
  };

  this._opts = opts;

  log.info('Ctor() :: Instantiating kafkaAvro with opts:', kafkaOpts);

  /** @type {?KafkaAvro} The kafka-avro instance */
  this.kafkaAvro = new KafkaAvro(kafkaOpts);

  /** @type {?KafkaAvro.Consumer} The kafka-avro consumer instance */
  this.consumer = null;

  /** @type {?KafkaAvro.Producer} The kafka-avro producer instance */
  this.producer = null;

  /** @type {Object} Will contain the instanciated rdkafka topics */
  this.topic = {};
});

/**
 * Boot the kafka service and spin up the master consumer.
 *
 * @return {Promise}
 */
Kafking.prototype.init = Promise.method(function () {

  log.info('init() :: Initializing Kafking...');

  return this.kafkaAvro.init()
    .bind(this)
    .then(function() {
      const promises = [];
      if (!this._opts.noConsumer) {
        promises.push(this._bootConsumer());
      }
      if (!this._opts.noProducer) {
        promises.push(this._bootProducers());
      }

      return Promise.all(promises);
    });
});

/**
 * Dispose the kafka service, disconnect consumers, cleanup.
 *
 * @return {Promise} A Promise.
 */
Kafking.prototype.dispose = Promise.method(function () {
  if (!this.consumer) {
    return;
  }
  return new Promise((resolve) => {
    this.consumer.disconnect(resolve);
    this.consumer.removeAllListeners();
  });
});

/**
 * Init the singleton consumers.
 *
 * @return {Promise}
 * @private
 */
Kafking.prototype._bootConsumer = Promise.method(function () {
  let consumerOpts = this._opts.consumerOpts || {
    'group.id': this._opts.consumerGroup,
    'socket.keepalive.enable': true,
    'enable.auto.commit': false,
    'auto.commit.interval.ms': 30000,
  };

  log.debug('_bootConsumer() :: Booting consumer with opts:', consumerOpts);

  return this.kafkaAvro.getConsumer(consumerOpts)
    .bind(this)
    .then(function(consumer) {
      this.consumer = consumer;

      this.consumer.on('data', this._handleData.bind(this));
      this.consumer.on('event.log', this._handleLog.bind(this));
      this.consumer.on('disconnected', this._handleDisconnect.bind(this));
      this.consumer.on('rebalance', this._handleRebalance.bind(this));
      this.consumer.commitAsync =
        Promise.promisify(this.consumer.commit.bind(this.consumer));

      // Perform a consumer.connect()
      return new Promise(function (resolve, reject) {
        consumer.on('ready', function() {
          resolve(consumer);
        });

        consumer.connect({}, function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(consumer); // depend on Promises' single resolve contract.
        });
      });
    })
    .then(function() {
      this.consumer.subscribe(this._opts.consumerTopics);

      this.consumer.consume();
    });
});

/**
 * Handle kafka errors.
 *
 * @param {Object} err Error emitted by node-rdkafka.
 * @private
 */
Kafking.prototype._handleError = function (err) {
  log.warn('_handleError() :: Kafka Consumer Error:', err);
};

/**
 * Handle incoming kafka messages.
 *
 * @param {Object} message Kafka raw message.
 * @private
 */
Kafking.prototype._handleData = function (message) {
  log.debug(`_handleData() :: Received message on topic: ${ message.topic }`,
    `Partition: ${ message.partition} Offset: ${ message.offset } `,
    `Key: ${ message.key} Size: ${message.size} message:`, message.parsed);

  if (!message.parsed) {
    log.warn('_handleData() :: Could not find deserialized value for topic:',
      `${ message.topic } Partition: ${ message.partition} Offset:`,
      `${ message.offset } Key: ${ message.key} Size: ${message.size}`);
    return;
  }

  this.emit('data', message);
  this.emit(message.topic, message);
};

/**
 * Handle logging from node-rdkafka library.
 *
 * @param {Object} logMessage node-rdkafka log message.
 * @private
 */
Kafking.prototype._handleLog = function (logMessage) {
  log.debug('_handleLog() :: node-rdkafka Consumer:', logMessage);
};

/**
 * Handle consumer 'disconnected' event.
 *
 * @param {?} arg Not sure what this is.
 * @private
 */
Kafking.prototype._handleDisconnect = function (arg) {
  log.info('_handleDisconnect() :: Consumer disconnected:', arg);
  this.emit('consumer-disconnected', arg);
};

/**
 * Handle a rebalance event.
 *
 * @parma {Object} event Event object emitted by node-rdkafka.
 * @private
 */
Kafking.prototype._handleRebalance = function (event) {
  if (event.code === KafkaAvro.CODES.REBALANCE.PARTITION_ASSIGNMENT) {
    log.info('_handleRebalance() :: Partition assignment:', event);
  } else {
    log.info('_handleRebalance() :: Partition unassignment:', event);
  }

  this.emit('rebalance', event);
};

/**
 * Init the singleton producers.
 *
 * @return {Promise}
 * @private
 */
Kafking.prototype._bootProducers = Promise.method(function () {
  const producerOpts = this._opts.producerOpts || {
    'dr_cb': true,
  };

  log.debug('_bootProducers() :: Booting producer with opts:', producerOpts);

  return this.kafkaAvro.getProducer(producerOpts)
    .bind(this)
    .then(function (producer) {
      this.producer = producer;

      // hack kafkaAvro
      producer.__kafking_produce = producer.produce;
      producer.produce = this._produceWrapper.bind(this, producer);

      producer.on('event.log', this._handleProducerLog.bind(this));
      producer.on('error', this._handleProducerError.bind(this));
      producer.on('delivery-report', this._handleProducerDelivery.bind(this));
      producer.on('disconnected', this._handleProducerDisconnect.bind(this));

      this._opts.producerTopics.forEach((producerTopic) => {
        const topicOpts = producerTopic.topicOpts || {
          // Make the Kafka broker acknowledge our message
          'request.required.acks': 1,
        };

        this.topic[producerTopic.topicName] =
          producer.Topic(producerTopic.topicName, topicOpts);
      });
    });
});

/**
 * Handle incoming kafka messages.
 *
 * @param {Object} message Kafka raw message.
 * @private
 */
Kafking.prototype._handleProducerLog = function (logMessage) {
  log.debug('_handleProducerLog() :: node-rdkafka Producer:',
    logMessage);
};

/**
 * Handle kafka Producer errors.
 *
 * @param {Object} err Error emitted by node-rdkafka.
 * @private
 */
Kafking.prototype._handleProducerError = function (err) {
  log.warn('_handleProducerError() :: Kafka Producer Error:', err);
};


/**
 * Handle kafka Producer errors.
 *
 * @param {Object|null} err In case of error.
 * @param {Object} receipt Receipt object.
 * @private
 */
Kafking.prototype._handleProducerDelivery = function (err, receipt) {
  log.debug('_handleProducerDelivery() :: Got receipt, err:', err,
    'receipt:', receipt);
  log.emit('delivery-report', err, receipt);
};

/**
 * Handle producer 'disconnected' event.
 *
 * @param {?} arg Not sure what this is.
 * @private
 */
Kafking.prototype._handleProducerDisconnect = function (arg) {
  log.info('_handleDisconnect() :: Producer disconnected:', arg);
  this.emit('producer-disconnected', arg);
};


/**
 * The kafka-avro produce method wrapper, will validate and serialize
 * the message against the existing schemas.
 *
 * @param {kafka.Producer} producerInstance kafka-avro instance.
 * @param {string|kafka.Producer.Topic} kafkaTopic node-rdkafka Topic instance
 *   or string that needs to map to a topic.
 * @param {number} partition The partition to produce on.
 * @param {Object} value The message.
 * @param {string|number} key The partioning key.
 * @param {*=} optOpaque Pass vars to receipt handler.
 */
Kafking.prototype._produceWrapper = function (producerInstance, kafkaTopic,
  partition, value, key, optOpaque) {

  if (typeof kafkaTopic === 'string') {
    if (this.topic[kafkaTopic]) {
      kafkaTopic = this.topic[kafkaTopic];
    }
  }

  return producerInstance.__kafking_produce(kafkaTopic, partition, value, key,
    optOpaque);

};
