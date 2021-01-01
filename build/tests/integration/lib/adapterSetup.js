"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdapterSetup = void 0;
// Add debug logging for tests
const objects_1 = require("alcalzone-shared/objects");
const debug_1 = __importDefault(require("debug"));
const fs_extra_1 = require("fs-extra");
const path = __importStar(require("path"));
const adapterTools_1 = require("../../../lib/adapterTools");
const executeCommand_1 = require("../../../lib/executeCommand");
const tools_1 = require("./tools");
const debug = debug_1.default("testing:integration:AdapterSetup");
class AdapterSetup {
    constructor(adapterDir, testDir, dbConnection) {
        this.adapterDir = adapterDir;
        this.testDir = testDir;
        this.dbConnection = dbConnection;
        debug("Creating AdapterSetup...");
        this.adapterName = adapterTools_1.getAdapterName(this.adapterDir);
        this.adapterFullName = adapterTools_1.getAdapterFullName(this.adapterDir);
        this.appName = adapterTools_1.getAppName(this.adapterDir);
        this.testAdapterDir = tools_1.getTestAdapterDir(this.adapterDir, this.testDir);
        this.testControllerDir = tools_1.getTestControllerDir(this.appName, this.testDir);
        debug(`  directories:`);
        debug(`    controller: ${this.testControllerDir}`);
        debug(`    adapter:    ${this.testAdapterDir}`);
        debug(`  appName:           ${this.appName}`);
        debug(`  adapterName:       ${this.adapterName}`);
    }
    /**
     * Tests if the adapter is already installed in the test directory
     */
    isAdapterInstalled() {
        return __awaiter(this, void 0, void 0, function* () {
            // We expect the adapter to be installed if the dir in <testDir>/node_modules exists
            return fs_extra_1.pathExists(this.testAdapterDir);
        });
    }
    /** Copies all adapter files (except a few) to the test directory */
    copyAdapterFilesToTestDir() {
        return __awaiter(this, void 0, void 0, function* () {
            debug("Copying adapter files to test directory...");
            // We install the adapter almost like it would be installed in the real world
            // Therefore pack it into a tarball and put it in the test dir for installation
            const packResult = yield executeCommand_1.executeCommand("npm", ["pack", "--loglevel", "silent"], {
                stdout: "pipe",
            });
            if (packResult.exitCode !== 0 || typeof packResult.stdout !== "string")
                throw new Error(`Packing the adapter tarball failed!`);
            // The last non-empty line of `npm pack`s STDOUT contains the tarball path
            const stdoutLines = packResult.stdout.trim().split(/[\r\n]+/);
            const tarballName = stdoutLines[stdoutLines.length - 1].trim();
            const tarballPath = path.resolve(this.adapterDir, tarballName);
            yield fs_extra_1.copy(tarballPath, path.resolve(this.testDir, tarballName));
            yield fs_extra_1.unlink(tarballPath);
            // Complete the package.json, so npm can do it's magic
            debug("Saving the adapter in package.json");
            const packageJsonPath = path.join(this.testDir, "package.json");
            const packageJson = yield fs_extra_1.readJSON(packageJsonPath);
            packageJson.dependencies[this.adapterFullName] = `file:./${tarballName}`;
            for (const [dep, version] of objects_1.entries(adapterTools_1.getAdapterDependencies(this.adapterDir))) {
                // Don't overwrite the js-controller github dependency with a probably lower one
                if (dep === "js-controller")
                    continue;
                packageJson.dependencies[`${this.appName}.${dep}`] = version;
            }
            yield fs_extra_1.writeJSON(packageJsonPath, packageJson, { spaces: 2 });
            debug("Deleting old remains of this adapter");
            if (yield fs_extra_1.pathExists(this.testAdapterDir))
                yield fs_extra_1.remove(this.testAdapterDir);
            debug("  => done!");
        });
    }
    /**
     * Adds an instance for an already installed adapter in the test directory
     */
    addAdapterInstance() {
        return __awaiter(this, void 0, void 0, function* () {
            debug("Adding adapter instance...");
            // execute iobroker add <adapter> -- This also installs missing dependencies
            const addResult = yield executeCommand_1.executeCommand("node", [
                `${this.appName}.js`,
                "add",
                this.adapterName,
                "--enabled",
                "false",
            ], {
                cwd: this.testControllerDir,
                stdout: "ignore",
            });
            if (addResult.exitCode !== 0)
                throw new Error(`Adding the adapter instance failed!`);
            debug("  => done!");
        });
    }
    deleteOldInstances() {
        return __awaiter(this, void 0, void 0, function* () {
            debug("Removing old adapter instances...");
            const { objects, states } = yield this.dbConnection.readDB();
            const instanceRegex = new RegExp(`^system\\.adapter\\.${this.adapterName}\\.\\d+`);
            const instanceObjsRegex = new RegExp(`^${this.adapterName}\\.\\d+\.`);
            const belongsToAdapter = (id) => {
                return (instanceRegex.test(id) ||
                    instanceObjsRegex.test(id) ||
                    id === this.adapterName ||
                    id === `${this.adapterName}.admin`);
            };
            if (objects) {
                for (const id of Object.keys(objects)) {
                    if (belongsToAdapter(id))
                        delete objects[id];
                }
            }
            if (states) {
                for (const id of Object.keys(states)) {
                    if (belongsToAdapter(id))
                        delete states[id];
                }
            }
            yield this.dbConnection.writeDB(objects, states);
        });
    }
}
exports.AdapterSetup = AdapterSetup;
