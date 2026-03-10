import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// 快速构建模式：跳过 sourcemap 和某些优化
const isFastBuild = process.env.VITE_FAST_BUILD === 'true'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: isFastBuild
      ? {
          // 快速构建：最小化构建时间
          sourcemap: false,
          minify: false,
          rollupOptions: {
            output: {
              format: 'cjs'
            }
          }
        }
      : {}
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: isFastBuild
      ? {
          // 快速构建：最小化构建时间
          sourcemap: false,
          minify: false,
          rollupOptions: {
            output: {
              format: 'cjs'
            }
          }
        }
      : {}
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    build: {
      sourcemap: isFastBuild ? false : true,
      minify: isFastBuild ? false : 'terser',
      rollupOptions: {
        output: {
          manualChunks: {
            monaco: ['monaco-editor']
          }
        }
      }
    },
    plugins: [vue(), tailwindcss()]
  }
})
