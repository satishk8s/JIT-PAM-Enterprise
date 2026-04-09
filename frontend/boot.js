(function() {
    document.documentElement.classList.add('app-boot-pending');
    document.documentElement.classList.add('feature-flags-pending');

    var theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);

    if (!window.API_BASE) {
        window.API_BASE = window.location.origin + '/api';
    }

    if (localStorage.getItem('isLoggedIn') === 'true') {
        document.documentElement.classList.add('session-restore-pending');
    }

    document.addEventListener('DOMContentLoaded', function() {
        if (!document.documentElement.classList.contains('session-restore-pending')) {
            document.body.classList.add('login-page');
        }
    });
})();
