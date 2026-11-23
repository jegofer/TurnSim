/**
 * Cliente de cálculo asíncrono para TurnSim / OSPA mediante Web Worker
 * Ejecuta la integración cinemática, envolventes y colisiones en un hilo secundario
 * evitando cualquier bloqueo del renderizado 2D/3D o la interfaz de usuario.
 *
 * Dispone de cancelación por identificador monótono (requestId) y repliegue síncrono
 * transparente si Worker o Blob no están disponibles en el entorno.
 */

import { buildCompleteSimulationResult } from "./envelope.js";
import { evaluateObstacleInterferences } from "./collisions.js";
import { INLINE_WORKER_SOURCE } from "./worker_source.js";

export class EngineWorkerClient {
  constructor() {
    this.worker = null;
    this.activeRequestId = 0;
    this.isWorkerReady = false;
    this._callbacks = new Map();
    this._initWorker();
  }

  _initWorker() {
    if (
      typeof window === "undefined" ||
      typeof Worker === "undefined" ||
      typeof Blob === "undefined" ||
      typeof URL === "undefined" ||
      !INLINE_WORKER_SOURCE
    ) {
      this.isWorkerReady = false;
      return;
    }
    try {
      const blob = new Blob([INLINE_WORKER_SOURCE], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      this.worker = new Worker(blobUrl);
      this.worker.onmessage = (e) => this._handleMessage(e);
      this.worker.onerror = (err) => {
        console.warn("Advertencia en Worker TurnSim. Activando repliegue síncrono:", err);
        this.isWorkerReady = false;
      };
      this.isWorkerReady = true;
    } catch (e) {
      console.warn("No fue posible instanciar el Blob Worker. Utilizando cálculo síncrono:", e);
      this.isWorkerReady = false;
    }
  }

  _handleMessage(e) {
    const data = e.data || {};
    const { id, success, error, simResult, interferenceReport } = data;
    if (id !== this.activeRequestId) {
      // Descartar peticiones obsoletas canceladas por cambios rápidos de usuario
      return;
    }
    const cb = this._callbacks.get(id);
    if (cb) {
      this._callbacks.delete(id);
      if (success) {
        cb(null, { simResult, interferenceReport });
      } else {
        cb(new Error(error || "Error en el cálculo cinemático del Worker"));
      }
    }
  }

  recomputeAll(payload, callback) {
    const reqId = ++this.activeRequestId;
    if (this.isWorkerReady && this.worker) {
      this._callbacks.set(reqId, callback);
      this.worker.postMessage({
        id: reqId,
        action: "RECOMPUTE_ALL",
        payload
      });
    } else {
      // Repliegue síncrono inmediato en el hilo principal
      try {
        const { vehicle, maneuver, options, obstacles, safetyMarginM } = payload;
        const simResult = buildCompleteSimulationResult(vehicle, maneuver, options);
        const interferenceReport = evaluateObstacleInterferences(simResult, obstacles, {
          safetyMargin: safetyMarginM,
          enableCCD: !options?.previewMode
        });
        callback(null, { simResult, interferenceReport });
      } catch (err) {
        callback(err);
      }
    }
  }

  recomputeInterferences(payload, callback) {
    const reqId = ++this.activeRequestId;
    if (this.isWorkerReady && this.worker) {
      this._callbacks.set(reqId, callback);
      this.worker.postMessage({
        id: reqId,
        action: "RECOMPUTE_INTERFERENCES",
        payload
      });
    } else {
      try {
        const { simResult, obstacles, safetyMarginM } = payload;
        const interferenceReport = evaluateObstacleInterferences(simResult, obstacles, safetyMarginM);
        callback(null, { interferenceReport });
      } catch (err) {
        callback(err);
      }
    }
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isWorkerReady = false;
    }
    this._callbacks.clear();
  }
}
