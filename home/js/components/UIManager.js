/**
 * UI Manager Component
 * Handles common UI operations like loading, toasts, and utilities
 */

export class UIManager {
    constructor() {
        this.loadingOverlay = null;
        this.toastNotification = null;
        this.toastMessage = null;
        this.toastIcon = null;
        this.init();
    }

    init() {
        this.setupElements();
    }

    setupElements() {
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.toastNotification = document.getElementById('toastNotification');
        this.toastMessage = document.getElementById('toastMessage');
        this.toastIcon = document.getElementById('toastIcon');
    }

    showLoading(show) {
        if (this.loadingOverlay) {
            this.loadingOverlay.style.display = show ? 'flex' : 'none';
        }
    }

    showToast(message, type = 'success') {
        if (!this.toastNotification || !this.toastMessage || !this.toastIcon) return;
        
        this.toastMessage.textContent = message;
        this.toastNotification.className = `toast-notification ${type}`;
        this.toastIcon.textContent = this.getToastIcon(type);
        
        this.toastNotification.style.display = 'block';
        
        setTimeout(() => {
            this.hideToast();
        }, 3000);
    }

    hideToast() {
        if (this.toastNotification) {
            this.toastNotification.style.display = 'none';
        }
    }

    getToastIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            info: 'ℹ️',
            warning: '⚠️'
        };
        return icons[type] || icons.success;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDuration(milliseconds) {
        if (!milliseconds || milliseconds === 0) return 'Unknown';
        const seconds = Math.round(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return minutes > 0 ? `${minutes}:${remainingSeconds.toString().padStart(2, '0')}` : `${seconds}s`;
    }

    validateServiceNowURL(url) {
        if (!url || typeof url !== 'string') return false;
        try {
            const urlObj = new URL(url);
            return urlObj.protocol === 'https:' && urlObj.hostname.includes('service-now.com');
        } catch (error) {
            return false;
        }
    }

    dispatchGlobalEvent(eventName, data = {}) {
        const event = new CustomEvent(eventName, {
            detail: data
        });
        document.dispatchEvent(event);
    }
}
