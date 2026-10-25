/**
 * The mobile application's entry point. `registerRootComponent` registers the
 * root component under the name native code launches, in Expo Go and in a
 * native build alike.
 */
import { registerRootComponent } from "expo";
import App from "./app/App.tsx";

registerRootComponent(App);
