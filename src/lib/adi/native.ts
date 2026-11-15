import { invoke } from '@tauri-apps/api/core';
import type { AdiContract } from './types';
export interface NativeAdiIdentity { runId: string; workspace: string; sessionId: string }
export interface NativeAdiMutation { identity: NativeAdiIdentity; contractDigest?: string }
export const prepareNativeAdi = (identity: NativeAdiIdentity, frontend: boolean) =>
  invoke<void>('adi_prepare_run', { identity, frontend });
export const commitNativeAdi = (identity: NativeAdiIdentity, contract: AdiContract) =>
  invoke<void>('adi_commit_contract', { identity, contract: { digest: contract.digest, generation: contract.generation,
    targetFiles: [...new Set(contract.decisions.flatMap(decision => decision.targetFiles))] } });

export const snapshotNativeAdi = (workspace: string) => invoke<string>('adi_snapshot_workspace', { workspace });
