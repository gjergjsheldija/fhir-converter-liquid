import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const UPSTREAM_URL = 'https://github.com/microsoft/FHIR-Converter.git';
const PROVENANCE_PATH = path.join(ROOT, 'test/e2e-test/liquid-fixtures/UPSTREAM_VERSION.md');
const ASSETS = {
    templates: {
        description: 'HL7v2 Liquid templates',
        upstreamPath: path.join('data', 'Templates', 'Hl7v2'),
        extension: '.liquid',
        destinations: [
            path.join(ROOT, 'src', 'templates', 'Hl7v2'),
            path.join(ROOT, 'src', 'service-templates', 'Hl7v2')
        ]
    },
    'expected-results': {
        description: 'official HL7v2 expected JSON results',
        upstreamPath: path.join(
            'src',
            'Microsoft.Health.Fhir.Liquid.Converter.FunctionalTests',
            'TestData',
            'Expected',
            'Hl7v2'
        ),
        extension: '.json',
        destinations: [path.join(ROOT, 'test', 'e2e-test', 'liquid-fixtures', 'Expected', 'Hl7v2')]
    },
    'hl7v2-samples': {
        description: 'HL7v2 UI sample messages',
        upstreamPath: path.join('data', 'SampleData', 'Hl7v2'),
        extension: '.hl7',
        destinations: [path.join(ROOT, 'src', 'sample-data', 'hl7v2')]
    }
};

function runGit(args, cwd) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function listFiles(directory, extension, relativeTo = directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            return listFiles(absolutePath, extension, relativeTo);
        }
        return entry.isFile() && entry.name.endsWith(extension)
            ? [path.relative(relativeTo, absolutePath)]
            : [];
    }).sort();
}

function getSha256(filePath) {
    return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function syncAssets(assetType) {
    const asset = ASSETS[assetType];
    if (!asset) {
        throw new Error(`Unknown asset type "${assetType}". Choose: ${Object.keys(ASSETS).join(', ')}`);
    }

    const provenance = await fs.readFile(PROVENANCE_PATH, 'utf8');
    const upstreamPin = provenance.match(/at tag `([^`]+)`\s*\(commit `([0-9a-f]{40})`\)/);
    if (!upstreamPin) {
        throw new Error(`Could not read the upstream tag and commit from ${PROVENANCE_PATH}`);
    }

    const [, tag, expectedCommit] = upstreamPin;
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fhir-converter-asset-sync-'));

    try {
        runGit(['init', '--quiet'], temporaryDirectory);
        runGit([
            'fetch',
            '--quiet',
            '--depth=1',
            UPSTREAM_URL,
            `refs/tags/${tag}:refs/tags/${tag}`
        ], temporaryDirectory);

        const fetchedCommit = runGit(['rev-parse', `${tag}^{commit}`], temporaryDirectory);
        if (fetchedCommit !== expectedCommit) {
            throw new Error(
                `Upstream tag ${tag} resolved to ${fetchedCommit}, but provenance pins ${expectedCommit}. ` +
                'Update the provenance deliberately before syncing.'
            );
        }

        const archive = execFileSync('git', [
            'archive',
            '--format=tar',
            expectedCommit,
            asset.upstreamPath
        ], { cwd: temporaryDirectory, maxBuffer: 64 * 1024 * 1024 });
        execFileSync('tar', ['-xf', '-', '-C', temporaryDirectory], { input: archive });

        const upstreamAssets = path.join(temporaryDirectory, asset.upstreamPath);
        const upstreamFiles = listFiles(upstreamAssets, asset.extension);
        if (upstreamFiles.length === 0) {
            throw new Error(`No ${asset.extension} files found in upstream path ${asset.upstreamPath}`);
        }

        for (const target of asset.destinations) {
            await fs.emptyDir(target);
            await fs.copy(upstreamAssets, target, { overwrite: true });

            const copiedFiles = listFiles(target, asset.extension);
            if (copiedFiles.length !== upstreamFiles.length ||
                copiedFiles.some((file, index) => file !== upstreamFiles[index])) {
                throw new Error(`File inventory does not match upstream after copying to ${target}`);
            }

            const contentDifferences = upstreamFiles.filter((file) => {
                return getSha256(path.join(upstreamAssets, file)) !== getSha256(path.join(target, file));
            });
            if (contentDifferences.length > 0) {
                throw new Error(
                    `File contents do not match upstream after copying to ${target}: ` +
                    contentDifferences.join(', ')
                );
            }
        }

        console.log(
            `Synced ${upstreamFiles.length} ${asset.description} from Microsoft FHIR Converter ` +
            `${tag} (${expectedCommit}).`
        );
    } finally {
        await fs.remove(temporaryDirectory);
    }
}

syncAssets(process.argv[2]).catch((error) => {
    console.error(`Upstream asset sync failed: ${error.message}`);
    process.exitCode = 1;
});
