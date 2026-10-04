/* Shared CMS reads. Every page is ordered by a unique ID so a response limit
   cannot silently discard rows or shuffle ties between requests.

   Pages are read by offset, so a row written or removed by another editor
   between two pages shifts the window. A changed total is one sign of that,
   but not the only one: a delete and an insert between the same two pages
   leave the total alone and still push a row across the boundary, unread. So
   every page after the first starts one row early, on the last row already
   read — the anchor. If the anchor is no longer exactly there, the window has
   moved and the read starts again (up to three tries). Rows are also
   deduplicated by id.

   What the anchor cannot see is a row whose sort value changes so it jumps
   from the unread part into the read part while a second edit makes up the
   difference — two edits landing between the same two pages of a table long
   enough to have a second page.

   `onPage(rows)`, when given, is called with everything read so far after each
   page, so a long history can be shown while older rows are still arriving. */
var AROMATI_CMS = (function () {
  "use strict";
  var SIZE = 200, TRIES = 3;

  function readAll(client, table, columns, order, ascending, onPage) {
    var tries = 0;

    function attempt() {
      var rows = [], seen = {}, offset = 0, total = null, anchor = null;
      tries += 1;

      function restart() {
        if (tries < TRIES) return attempt();
        throw new Error(table + ": the rows kept changing while they were read");
      }

      function page() {
        var start = anchor === null ? offset : offset - 1;
        return client.from(table).select(columns, { count: "exact" })
          .order(order, { ascending: ascending !== false })
          .order("id", { ascending: ascending !== false })
          .range(start, offset + SIZE - 1)
          .then(function (res) {
            if (res.error) throw new Error(table + ": " + res.error.message);
            if (typeof res.count === "number") {
              if (total === null) total = res.count;
              else if (res.count !== total) return restart();
            }
            var batch = res.data || [];
            if (anchor !== null) {
              if (!batch.length || JSON.stringify(batch[0]) !== anchor) return restart();
              batch = batch.slice(1);
            }
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
            if (batch.length) anchor = JSON.stringify(batch[batch.length - 1]);
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
