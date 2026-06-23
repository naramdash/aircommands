// https://nuxt.com/docs/api/configuration/nuxt-config

import { resolve } from "node:path";

export default defineNuxtConfig({
  compatibilityDate: '2026-06-23',
  devtools: { enabled: true },

  ssr: false,
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  nitro: {
    preset: 'bun',
    publicAssets: [
      {
        dir: resolve('node_modules/@mediapipe/tasks-vision/wasm'),
        baseURL: '/mediapipe/tasks-vision/wasm',
        maxAge: 60 * 60 * 24, // 1 day
      }
    ]
  }
})
