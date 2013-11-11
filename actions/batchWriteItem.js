var async = require('async'),
    putItem = require('./putItem'),
    deleteItem = require('./deleteItem'),
    db = require('../db')

module.exports = function batchWriteItem(data, cb) {
  var actions = []

  async.series([
    async.each.bind(async, Object.keys(data.RequestItems), addTableActions),
    async.parallel.bind(async, actions),
  ], function(err, responses) {
    if (err) return cb(err)
    var res = {UnprocessedItems: {}}, tableUnits = {}

    if (data.ReturnConsumedCapacity == 'TOTAL') {
      responses[1].forEach(function(action) {
        var table = action.ConsumedCapacity.TableName
        if (!tableUnits[table]) tableUnits[table] = 0
        tableUnits[table] += action.ConsumedCapacity.CapacityUnits
      })
      res.ConsumedCapacity = Object.keys(tableUnits).map(function(table) {
        return {CapacityUnits: tableUnits[table], TableName: table}
      })
    }

    cb(null, res)
  })

  function addTableActions(tableName, cb) {
    db.getTable(tableName, function(err, table) {
      if (err) return cb(err)

      var reqs = data.RequestItems[tableName], i, req, key, seenKeys = {}, options

      for (i = 0; i < reqs.length; i++) {
        req = reqs[i]

        options = {TableName: tableName}
        if (data.ReturnConsumedCapacity) options.ReturnConsumedCapacity = data.ReturnConsumedCapacity

        if (req.PutRequest) {

          options.Item = req.PutRequest.Item
          actions.push(putItem.bind(null, options))

          key = db.validateItem(req.PutRequest.Item, table)

        } else if (req.DeleteRequest) {

          options.Key = req.DeleteRequest.Key
          actions.push(deleteItem.bind(null, options))

          key = db.validateKey(req.DeleteRequest.Key, table)
        }
        if (key instanceof Error) return cb(key)
        if (seenKeys[key])
          return cb(db.validationError('Provided list of item keys contains duplicates'))
        seenKeys[key] = true
      }

      cb()
    })
  }
}
