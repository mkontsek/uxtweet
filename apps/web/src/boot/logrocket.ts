import { boot } from 'quasar/wrappers';
import { initAnalytics } from '../analytics';

// Initialise LogRocket once the Vue app exists so it can hook the error handler.
export default boot(({ app }) => {
    initAnalytics(app);
});
