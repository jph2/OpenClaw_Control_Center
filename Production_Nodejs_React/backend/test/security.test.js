import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../index.js';

test('Security G1: Path Traversal Defenses', async (t) => {
    
    await t.test('Block absolute path injection escaping WORKSPACE_ROOT', async () => {
        const response = await request(app)
            .get('/api/workbench/list?path=/etc/passwd')
            .expect(403);
            
        assert.strictEqual(response.body.error, true);
        assert.match(
            response.body.message,
            /blocked|Internal Server Error|allowed workbench roots|Path traversal/i
        ); // Dev exposes detail; production masks to Internal Server Error
    });

    await t.test('Block relative traversal sequence (../../)', async () => {
        const response = await request(app)
            .get('/api/workbench/list?path=../../../var/log')
            .expect(403);
            
        assert.strictEqual(response.body.error, true);
    });

    await t.test('Block partial directory name escaping', async () => {
        // Attack scenario: Root is /data/workspace, attacker tries /data/workspace_secrets
        const response = await request(app)
            .get('/api/workbench/list?path=../workspace_secrets')
            .expect(403);
            
        assert.strictEqual(response.body.error, true);
    });
});

test('Security G4: Zod Input Validation', async (t) => {
    await t.test('Reject missing channelId payload', async () => {
        const response = await request(app)
            .post('/api/channels/update')
            .send({ agents: ['discord'] })
            .expect(400); // Bad Request due to Zod validation
            
        assert.strictEqual(response.body.error, true);
    });

    await t.test('Reject invalid data types automatically', async () => {
        const response = await request(app)
            .post('/api/channels/update')
            .send({ channelId: 'admin_panel', skills: 'not-an-array' }) // skills must be string[] or nullish
            .expect(400);

        assert.strictEqual(response.body.error, true);
    });

    await t.test('Reject missing workerId for Worker Candidate updates', async () => {
        const response = await request(app)
            .post('/api/channels/updateWorkerCandidate')
            .send({ modelProfile: 'openai/gpt-5.4' })
            .expect(400);

        assert.strictEqual(response.body.error, true);
    });
});
