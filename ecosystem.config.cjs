module.exports = {
    apps: [
        {
            name: 'kb-system',
            script: 'dist/server.js',
            env: {
                NODE_ENV: 'production',
            },
            // Restart on failure, but not more than 10 times quickly
            exp_backoff_restart_delay: 100,
            max_memory_restart: '1G',
        }
    ]
};
