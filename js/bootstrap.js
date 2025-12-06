import { loadPlayerState } from "./core.state.js";
import { loadTheme, applyTheme } from "./core.theme.js";

import { initTabs } from "./ui.tabs.js";
import { renderPlayerBar } from "./ui.player.js";
import { renderPaths } from "./ui.paths.js";
import { renderQuests } from "./ui.quests.js";
import { renderCommunity } from "./ui.community.js";
import { renderAvatar } from "./ui.avatar.js";
import { renderStore } from "./ui.store.js";
import { initAIChat } from "./ai.chat.js";

function bootstrap() {
  loadPlayerState();

  const theme = loadTheme();
  if (theme) applyTheme(theme);

  initTabs();
  initAIChat();

  renderPlayerBar();
  renderPaths();
  renderQuests();
  renderCommunity();
  renderAvatar();
  renderStore();
}

bootstrap();
