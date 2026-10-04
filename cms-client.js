/* Shared CMS reads. Every page is ordered by a unique ID so a response limit
   cannot silently discard rows or shuffle ties between requests.

   Pages are read by offset, so a row written or removed by another editor
   between two pages shifts the window. A changed total restarts the read (up
   to three tries), and rows are deduplicated by id, so the result is never a
   silent mix of two states of the table.

   `onPage(rows)`, when given, is called with everything read so far after each
   page, so a long history can be shown while older rows are still arriving. */
var AROMATI_CMS = (function () {
  "use strict";
  var SIZE = 200, TRIES = 3;

  function readAll(client, table, columns, order, ascending, onPage) {
    var tries = 0;

    function attempt() {
      var rows = [], seen = {}, offset = 0, total = null;
      tries += 1;

      function page() {
        return client.from(table).select(columns, { count: "exact" })
          .order(order, { ascending: ascending !== false })
          .order("id", { ascending: ascending !== false })
          .range(offset, offset + SIZE - 1)
          .then(function (res) {
            if (res.error) throw new Error(table + ": " + res.error.message);
            if (typeof res.count === "number") {
              if (total === null) total = res.count;
              else if (res.count !== total) {
                if (tries < TRIES) return attempt();
                throw new Error(table + ": the rows kept changing while they were read");
              }
            }
            var batch = res.data || [];
            offset += batch.length;
            batch.forEach(function (row) {
              var id = row && row.id;
              if (id !== undefined && id !== null) {
                if (seen[id]) return;
                seen[id] = true;
              }
              rows.push(row);
            });
            if (!batch.length && total !== null && offset < total) {
              throw new Error(table + ": the response stopped before all rows arrived");
            }
            var more = batch.length && (total !== null ? offset < total : batch.length === SIZE);
            if (more && onPage) onPage(rows.slice());
            if (more) return page();
            return rows;
          });
      }
      return page();
    }
    return attempt();
  }
  return { readAll: readAll };
})();
