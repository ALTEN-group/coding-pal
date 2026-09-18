import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import AnimatedLogo from './AnimatedLogo.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'home-hero-image': () => h(AnimatedLogo),
    });
  },
};
