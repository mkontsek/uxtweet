import { boot } from 'quasar/wrappers';
import { createPinia } from 'pinia';

// Install Pinia so stores (e.g. the chat store) are available app-wide.
export default boot(({ app }) => {
    app.use(createPinia());
});
