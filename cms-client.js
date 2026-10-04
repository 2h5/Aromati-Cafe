/* Shared CMS reads. Every page is ordered by a unique ID so a response limit
   cannot silently discard rows or shuffle ties between requests. */
var AROMATI_CMS = (function () {
  "use strict";
  function readAll(client, table, columns, order, ascending) {
    var rows = [], size = 200;
    function page() {
      return client.from(table).select(columns, { count: "exact" })
        .order(order, { ascending: ascending !== false })
        .order("id", { ascending: ascending !== false })
        .range(rows.length, rows.length + size - 1)
        .then(function (res) {
          if (res.error) throw new Error(table + ": " + res.error.message);
          var batch = res.data || [];
          rows = rows.concat(batch);
          if (!batch.length && typeof res.count === "number" && rows.length < res.count) {
            throw new Error(table + ": the response stopped before all rows arrived");
          }
          if (batch.length && (typeof res.count === "number"
              ? rows.length < res.count : batch.length === size)) return page();
          return rows;
        });
    }
    return page();
  }
  return { readAll: readAll };
})();
