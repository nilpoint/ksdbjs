var mongo = require('mongodb'),
    gt = require('guardtime'),
    restify = require('restify');

var server, Server = mongo.Server,
    db, Db = mongo.Db;

var inputParams;

exports.init = function (conf, logger) {
  gt.conf({signeruri:   conf.signeruri,
           verifieruri: conf.verifieruri});

  inputParams = conf.inputParams || {};

  server = new Server(conf.databasehost, conf.databaseport, {auto_reconnect: true});
  db = new Db('ksdbjs', server, {safe: true});
  db.open( function (err, db) {
    if (err) {
      logger.error(err);
      throw err;
    }
    logger.info("Connected to '%s' database", db.databaseName);
    db.createCollection('ksdbjs', function (err, coll) {
      if (err) {
        logger.error(err);
        throw err;
      }
      db.ensureIndex('ksdbjs', {hash: 1}, {unique: true, dropDups: true}, function (err, name) {
        logger.debug('Created index: ' + name);
      });
    });
  });
};

exports.verify = function (req, res, next) {
  var hash = req.params.hash;  // needs restify.queryParser plugin
  var algorithm = req.query.algorithm || 'sha256';

  if (req.header('Accept', '').match(/octet-stream/i))
    return next(new restify.NotAcceptableError('This service does not serve application/octet-stream'));

  if (!hash)
    return next(new restify.InvalidArgumentError("Missing parameter 'hash'"));

  req.log.debug('hash to verify: ' + algorithm + ':' + hash);
  db.collection('ksdbjs', function(err, collection) {
    collection.findOne({'hash': hash}, function(err, item) {
      if (err)
        return next(err);

      if (item === null)  return next(new restify.ResourceNotFoundError('Unknown hash'));
      if (item.sig === null)  return next(new restify.InternalError());
      var ts = new gt.TimeSignature(item.sig.toString('binary'));
      gt.verifyHash(new Buffer(hash, 'hex'), algorithm, ts, function (err, flags, props) {
        if (err)
          return next(err);
        res.send(props);
        return next();
      });
    });
  });
};


exports.download = function (req, res, next) {
  var hash = req.params.hash;
  var algorithm = req.query.algorithm || 'sha256';

  if (!hash)
    return next(new restify.InvalidArgumentError("Missing parameter 'hash'"));

  req.log.debug('token download: ' + algorithm + ':' + hash);
  db.collection('ksdbjs', function(err, collection) {
    collection.findOne({'hash': hash}, function(err, item) {
      if (err)
        return next(err);
      if (item === null)
        return next(new restify.ResourceNotFoundError('Unknown hash'));

      var ts = new gt.TimeSignature(item.sig.toString('binary'));

      gt.verifyHash(new Buffer(hash, 'hex'), algorithm, ts, function (err, flags, props) {
        if (err)
          return next(err);
        if (req.header('Accept', '').match(/octet-stream|html/i)) { // html - direct token download with web browser
          res.set('Content-Disposition', 'attachment; filename=signaturetoken.gtts' );
          res.set('X-GuardTime-at', props.registered_time);
          res.set('X-GuardTime-id', props.location_name);
          res.write(ts.getContent()); // todo: think about returning extended token
          res.end();
          return next();
        } else {
          res.send({
                token: ts.getContent().toString('base64'),
                properties: props
              });
          return next();
        }
      });
    });
  });
};

exports.sign = function (req, res, next) {
  var username = req.user.username;
  var hash = req.params.hash;
  var algorithm = req.query.algorithm || 'sha256';

  if (!hash)
    return next(new restify.InvalidArgumentError("Missing parameter 'hash'"));

  // Check if param is required and if it exists
  for (var key in inputParams) {
      if (inputParams[key]['required'] && !req.query[key]) {
          return next(new restify.InvalidArgumentError("Missing parameter '" + key + "'"));
      }
  }

  // validate args early
  var hashbuf;
  try {
    hashbuf = new Buffer(hash, 'hex');
  } catch(e) {
    return next(new restify.InvalidArgumentError("Invalid hex 'hash'"));
  }
  req.log.debug('hash insertion: ' + algorithm + ":" + hash);

  if (req.query.async) {
    res.send(202, 'Request accepted'); // note: may generate multiple records or uniq. key collision at db.
    res = {};  // probably not necessary; we're the last user of res anyway.
    res.send = function (a) {req.log.debug('async result: ' + a);};
    next();
  }

  db.collection('ksdbjs', function(err, collection) {
    collection.findOne({'hash': hash}, function(err, item) {
      if (err)
        return next(err);
      if (item !== null) {
        res.send(200, 'Already signed');
        return next();
      }
      gt.signHash(hashbuf, algorithm, function (err, sig) {
        if (err) {
          if (err.message.match(/Bad data format|Unsupported hash algorithm/i))
            err.statusCode = 409;
          err.message = 'Error signing hash: ' + err.message;
          return next(err);
        }

        var storeObject = {
            // '_id': new mongo.ObjectID(hash.substr(0, 24)),
            'hash': hash,
            'alg': algorithm,
            'inserted': new Date(),
            'sig': new mongo.Binary(sig.getContent())
        };

        for (var key in inputParams) {
          var field = inputParams[key]['databaseField'];
          if (field) {
            storeObject[field] = req.query[key] || inputParams[key]['default'];
            if (Object.prototype.toString.call(storeObject[field]) == '[object String]')
              storeObject[field] = storeObject[field].replace('$', '\uff04').replace('.', '\uff0e');
          }
        }

        // Override ClientName by using username
        storeObject['ClientName'] = username;

        collection.insert(storeObject, {safe:true}, function(err, result) {
          if (err) {
            err.message = 'Error saving hash: ' + err.message;
            return next(err);
          } else {
            req.log.debug('' + result.length + ' document(s) updated');
            res.send(201, 'Signature created and stored');
            return next();
          }
        });
      });
    });
  });
};

exports.param = function (req, res, next) {
  var hash = req.params.hash;

  if (req.header('Accept', '').match(/octet-stream/i))
    return next(new restify.NotAcceptableError('This service does not serve application/octet-stream'));

  // validate args early
  try {
    var hashbuf = new Buffer(hash, 'hex');
  } catch(e) {
    return next(new restify.InvalidArgumentError("Invalid hex 'hash'"));
  }


  db.collection('ksdbjs', function(err, collection) {
    collection.findOne({'hash': hash}, function(err, item) {
      if (err)
        return next(err);

      if (item === null) {
        return next(new restify.ResourceNotFoundError('Unknown hash'));
      }

      var props = {};
      var propsCount = 0;
      for (var key in inputParams) {
        if (inputParams[key]['retrievable']) {
          if (!item[inputParams[key]['databaseField']]) {
            return next(new restify.InternalError("Param '" + key + "' missing for hash"));
          }

          props[key] = item[inputParams[key]['databaseField']];
          propsCount++;
        }
      }

      if (propsCount === 0) {
        return next(new restify.InvalidArgumentError("No parameters defined!"));
      }

      res.send(props);
      return next();
    });
  });
};
