# Partitioned wallet archive

Full wallet records, including private keys and recovery phrases, are stored in immutable `saved/parts/wallets-000001.jsonl` files. New files are created when the current file would exceed 128 MiB. The SQLite catalog remains at `saved/collections.sqlite` and keeps public summaries, searchable metadata, batch provenance, and checksummed file pointers. Deduplication remains global by chain and address; splitting the payloads does not create separate collections.

## Existing archives

Stop the hunt and close the XA Wallet Generator server command window, then double-click `Optimize Wallet Archive.cmd`. The command refuses to run while localhost port 5173 is open. An archive writer lock also prevents a new application instance from opening the archive during maintenance. Do not run an older XA Wallet Generator version against the same folder during maintenance.

The command creates a consistent SQLite backup and copies any existing part files into a timestamped folder under `saved/backups/`. It builds the search indexes, moves inline records into part files in batches, verifies every record against its pre-migration bytes, checks the catalog integrity, and compacts the catalog. It checks free disk space before starting. Progress reports contain record counts, never private keys. Keep the backup until you have checked the migrated collection and exports. Run `Start XA Wallet Generator.cmd` afterward.

Migration is resumable: existing pointers remain readable and remaining inline records can be moved on a later run. Each run makes a new recovery snapshot. If maintenance fails, leave all part files in place and rerun after resolving the reported problem. Do not replace only the catalog or only the parts with a mismatched backup. Restoring an older snapshot would also omit wallets saved after that snapshot; preserve the current archive before attempting recovery.

New saves use parts immediately after the upgraded server starts. Existing inline records remain readable before migration, but moving them and shrinking the old database requires the maintenance command. The first startup after an index schema or dictionary revision may rebuild indexes; maintenance performs that work before the normal launch.

## Search behavior

Indexed tables cover exact matched words, categories, positions, casing, repeat lengths, and common result sorts. A SQLite FTS5 trigram index narrows text queries containing alphanumeric terms of at least three characters. The original matcher still verifies candidates, preserving symmetric look-alike rules such as `5` and `s`, including ambiguous `1`, `i`, and `l` matches. Short or punctuation-containing queries use the exact scan fallback and can remain slower. Matching-word counts and exports use the same indexed selection as the results page.

The searchable catalog is intentionally centralized so global sorting, filtering, counts, and duplicate detection do not need to open every payload part. A large indexed SQLite catalog is supported; file size alone is not the reason a query is slow. Large unselective queries, deep offset pagination, and full word-count aggregations still do work proportional to the matching collection. This is not a guarantee of constant-time searches at arbitrary archive sizes.

## Durability and deletion

Payload writes are flushed before SQLite commits a pointer. Records are immutable so an export's database snapshot continues to refer to the original bytes while a hunt saves updates. Reads verify each payload checksum. An interrupted save can leave unreferenced bytes, but cannot replace an earlier wallet's payload. Batch deletion removes wallet visibility, provenance, and search-index entries according to the existing shared-wallet rules; old payload bytes can remain in part files and backups. This is logical deletion, not secure erasure. Never manually delete a part file to remove a batch.

Back up the catalog and all `parts/` files together while the server is stopped. Exports remain separate files in `saved/exports/`. The entire `saved/` tree is private and blocked from ordinary HTTP file access. Payloads and backups contain unencrypted wallet secrets, as the original archive did.

## Validation

`node --test test/archive-parts.test.js test/saved-store.test.js` exercises rollover, deduplication, exact filter parity, payload restoration, exports, backups, and resumable migration using synthetic fixtures in temporary folders. `node scripts/benchmark-archive.mjs 500000` creates and deletes an isolated synthetic archive and compares indexed queries with the former scan behavior. These commands do not insert fixtures into the live collection or print private keys.


Generation totals are stored in the catalog’s `generation_runs` table, one row per run ID. Updates replace each run’s cumulative checked count and elapsed milliseconds using monotonic maxima, rather than adding every progress notification. GPU statistics are recorded by the local backend, including stop and completion; CPU checkpoints are retried from browser storage if delivery fails. Both header totals include the active run once. Elapsed run time counts preparation and stopping time, and counts a multi-GPU run once rather than once per card. Checkpoints bound crash loss but cannot recover work never reported by a worker. Runs before this feature was installed have no recoverable checked/runtime history; saved-wallet count is not used as a substitute.
