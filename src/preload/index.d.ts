import type { MdViewApi } from './index'

declare global {
  interface Window {
    mdview: MdViewApi
  }
}

export {}
