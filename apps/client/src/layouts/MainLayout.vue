<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <q-toolbar-title data-cy="app-title">UXTweet</q-toolbar-title>
        <ConnectionStatus
          :status="status"
          :user-count="userCount"
        />
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script lang="ts" setup>
import { provide } from 'vue';
import ConnectionStatus from '../components/ConnectionStatus.vue';
import { useChat } from '../composables/useChat';

const WS_URL = process.env.WS_URL ?? 'ws://localhost:3000/ws';

const chat = useChat(WS_URL);
chat.connect();

provide('chat', chat);

const { status, userCount } = chat;
</script>
