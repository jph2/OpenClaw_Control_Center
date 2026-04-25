import { expect, test } from '@playwright/test';
import {
  apiJson,
  backendUrl,
  buildDraft,
  cleanupDraftAndSidecar,
  cleanupMemoryPromotion,
  getChannels,
  makeRunId,
  pickTestChannel,
  todayDateSlug,
  writeEvidence
} from './helpers/bridgeTestHelpers.js';

test.describe('E2E_GOLDEN_PATH_8B5', () => {
  test('saves an A070 draft, resolves TTG by project mapping, promotes, and confirms read-back', async ({
    page,
    request
  }, testInfo) => {
    const runId = makeRunId();
    const projectId = 'e2e-bridge-smoke';
    const consoleErrors = [];
    const context = {
      runId,
      projectId,
      backendUrl,
      mappingRestored: false,
      draftCleaned: false,
      memoryCleaned: false
    };

    page.on('pageerror', (error) => {
      consoleErrors.push(`pageerror: ${error.message}`);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(`console.error: ${message.text()}`);
      }
    });

    const mappingSnapshot = await apiJson(request, 'GET', '/api/ide-project-summaries/project-mappings');
    const originalMappings = mappingSnapshot.projectMappings || [];

    let finalMeta = null;
    let draft = null;
    try {
      const channels = await getChannels(request);
      const channel = pickTestChannel(channels);
      draft = buildDraft({ runId, channel, projectId });
      Object.assign(context, {
        channelId: channel.id,
        channelName: channel.name,
        draftPath: draft.relativePath
      });

      const e2eMapping = {
        projectId,
        repoSlug: projectId,
        projectMappingKey: '',
        ttgId: String(channel.id),
        label: 'E2E smoke',
        note: `Temporary Playwright mapping for ${runId}`
      };
      const nextMappings = [
        ...originalMappings.filter((row) => row.projectId !== projectId && row.repoSlug !== projectId),
        e2eMapping
      ];
      const mappingResult = await apiJson(request, 'PUT', '/api/ide-project-summaries/project-mappings', {
        projectMappings: nextMappings
      });
      context.mappingCount = mappingResult.projectMappings?.length || 0;

      await page.goto('/channels');
      await expect(page.getByRole('heading', { name: /Channel Manager/ })).toBeVisible();

      await page.getByRole('button', { name: /TARS in IDE, all/ }).click();
      const summaryPanel = page.getByTestId(`ide-summary-panel-${channel.id}`);
      await expect(summaryPanel.getByText('TARS in IDE · IDE project summary')).toBeVisible();

      await summaryPanel.getByTestId('ide-summary-draft-path').fill(draft.relativePath);
      await summaryPanel.getByTestId('ide-summary-draft-text').fill(draft.text);
      await summaryPanel.getByTestId('ide-summary-adapter').selectOption('manual');
      await summaryPanel.getByTestId('ide-summary-project-root').fill('');
      await summaryPanel.getByTestId('ide-summary-project-id').fill(projectId);

      // Leave TTG blank on purpose: this proves the resolver used the project mapping store.
      await summaryPanel.getByTestId('ide-summary-explicit-ttg').fill('');

      await summaryPanel.getByTestId('ide-summary-save').click();
      const draftButton = summaryPanel.getByTestId(`ide-summary-file-${draft.relativePath}`);
      await expect(draftButton).toBeVisible();
      await draftButton.click();

      await expect(summaryPanel.locator('text=Binding:').first()).toBeVisible();
      await expect(summaryPanel.locator('text=Method:').first()).toBeVisible();
      await expect(summaryPanel.locator('code', { hasText: 'project_mapping' }).first()).toBeVisible();

      const saved = await apiJson(
        request,
        'GET',
        `/api/ide-project-summaries/file?relative=${encodeURIComponent(draft.relativePath)}`
      );
      expect(saved.meta?.binding?.status).toBe('confirmed');
      expect(saved.meta?.binding?.method).toBe('project_mapping');
      expect(saved.meta?.ttgId).toBe(String(channel.id));
      context.savedMeta = {
        bridgeStatus: saved.bridgeStatus,
        binding: saved.meta?.binding,
        metaRelativePath: saved.metaRelativePath
      };

      await summaryPanel.getByTestId('ide-summary-promote').click();
      await expect(page.getByRole('heading', { name: /Promote to OpenClaw memory/ })).toBeVisible();
      await page.getByRole('button', { name: /Check destination/ }).click();
      await expect(page.getByText(/Target: .*\/memory\//)).toBeVisible();
      await expect(page.locator('text=Append preview')).toBeVisible();
      await page.getByRole('button', { name: /Confirm promote/ }).click();

      await expect.poll(async () => {
        const current = await apiJson(
          request,
          'GET',
          `/api/ide-project-summaries/file?relative=${encodeURIComponent(draft.relativePath)}`
        );
        finalMeta = current.meta;
        return current.meta?.promotion?.status;
      }, {
        message: 'sidecar promotion status should become readback_confirmed',
        timeout: 15_000
      }).toBe('readback_confirmed');

      await draftButton.click();
      await expect(summaryPanel.locator('text=Read-back confirmed').first()).toBeVisible();
      await expect(summaryPanel.locator('text=Target:').first()).toBeVisible();

      expect(finalMeta?.promotion?.marker).toMatch(/^<!-- CM_PROMOTE_[a-f0-9]+ -->$/);
      expect(finalMeta?.promotion?.target).toBe(`${todayDateSlug()}.md`);
      expect(finalMeta?.binding?.method).toBe('project_mapping');
      expect(consoleErrors).toEqual([]);

      context.finalMeta = {
        binding: finalMeta.binding,
        promotion: finalMeta.promotion,
        promotedTo: finalMeta.promotedTo
      };
    } finally {
      try {
        await apiJson(request, 'PUT', '/api/ide-project-summaries/project-mappings', {
          projectMappings: originalMappings
        });
        context.mappingRestored = true;
      } catch (error) {
        context.mappingRestoreError = String(error.message || error);
      }

      if (draft?.relativePath) {
        await cleanupDraftAndSidecar(draft.relativePath);
        context.draftCleaned = true;
      }

      try {
        await cleanupMemoryPromotion(finalMeta);
        context.memoryCleaned = true;
      } catch (error) {
        context.memoryCleanupError = String(error.message || error);
      }

      await writeEvidence(testInfo, 'e2e-golden-path-8b5-context', context);
    }
  });
});
