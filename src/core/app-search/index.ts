import commonConst from "@/common/utils/commonConst";
import darwinSearch from "./darwin";
import winSearch from "./win";
import linuxSearch from "./linux";

let appSearch;

if (commonConst.macOS()) {
  appSearch = darwinSearch;
} else if (commonConst.windows()) {
  appSearch = winSearch;
} else if (commonConst.linux()) {
  appSearch = linuxSearch;
}

export default appSearch;
