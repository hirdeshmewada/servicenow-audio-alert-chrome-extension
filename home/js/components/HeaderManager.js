/**
 * Header Manager Component
 * Handles header controls and status indicators
 */

export class HeaderManager {
    constructor() {
        this.startStopBtn = null;
        this.statusDot = null;
        this.statusText = null;
        this.startStopIcon = null;
        this.startStopText = null;
        this.init();
    }

    init() {
        this.setupElements();
        this.setupEventListeners();
    }

    setupElements() {
        this.startStopBtn = document.getElementById('startStopBtn');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.startStopIcon = document.getElementById('startStopIcon');
        this.startStopText = document.getElementById('startStopText');
    }

    setupEventListeners() {
        if (this.startStopBtn) {
            this.startStopBtn.addEventListener('click', () => {
                this.dispatchToggleMonitoring();
            });
        }
    }

    updateMonitoringStatus(isMonitoring) {
        const isActive = isMonitoring;
        
        // Update header status
        if (this.statusDot) {
            this.statusDot.className = `status-dot ${isActive ? '' : 'inactive'}`;
        }
        if (this.statusText) {
            this.statusText.textContent = isActive ? 'Active' : 'Stopped';
        }
        if (this.startStopIcon) {
            this.startStopIcon.textContent = isActive ? '⏸️' : '▶️';
        }
        if (this.startStopText) {
            this.startStopText.textContent = isActive ? 'Stop' : 'Start';
        }
        
        // Update button state
        if (this.startStopBtn) {
            this.startStopBtn.classList.toggle('active', isActive);
        }
    }

    dispatchToggleMonitoring() {
        const event = new CustomEvent('toggleMonitoring', {
            detail: { isMonitoring: !this.isMonitoringActive() }
        });
        document.dispatchEvent(event);
    }

    isMonitoringActive() {
        return this.startStopBtn && this.startStopBtn.classList.contains('active');
    }

    setMonitoringState(isActive) {
        this.updateMonitoringStatus(isActive);
    }
}
