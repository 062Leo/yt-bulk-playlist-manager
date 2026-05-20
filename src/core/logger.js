// logger.js – Unified console logger with a fixed, filterable prefix ([YT-BULK])

const Logger = {
  info(...args) {
    console.log(CONFIG.LOG_PREFIX, '[INFO]', ...args);
  },

  success(...args) {
    console.log(CONFIG.LOG_PREFIX, '[SUCCESS]', ...args);
  },

  warn(...args) {
    console.warn(CONFIG.LOG_PREFIX, '[WARN]', ...args);
  },

  error(...args) {
    console.error(CONFIG.LOG_PREFIX, '[ERROR]', ...args);
  },

  debug(...args) {
    console.log(CONFIG.LOG_PREFIX, '[DEBUG]', ...args);
  },
};

function logGroup(label, fn) {
  console.group(CONFIG.LOG_PREFIX, label);
  try {
    fn();
  } finally {
    console.groupEnd();
  }
}
