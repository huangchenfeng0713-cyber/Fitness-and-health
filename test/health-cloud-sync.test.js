import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchHealthRows } from '../js/lib/health-cloud-sync.js';

test('旧健康数据表回退成功后不再反复请求不存在的字段', async () => {
  const calls = { current: 0, legacy: 0 };
  const row = { date: '2026-09-24', updated_at: '2026-09-24T03:00:00Z' };
  const client = {
    from(table) {
      assert.equal(table, 'health_daily');
      return {
        select(columns) {
          const modern = columns.includes('active_energy_captured_at');
          calls[modern ? 'current' : 'legacy'] += 1;
          return {
            gte() { return this; },
            order() { return this; },
            async range() {
              return modern
                ? { data: null, error: { code: '42703', message: 'column active_energy_captured_at does not exist' } }
                : { data: [row], error: null };
            },
          };
        },
      };
    },
  };
  assert.deepEqual(await fetchHealthRows(client), [row]);
  assert.deepEqual(await fetchHealthRows(client, { updatedAfter: row.updated_at }), [row]);
  assert.deepEqual(calls, { current: 1, legacy: 2 });
});
