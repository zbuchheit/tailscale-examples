import * as fs from 'fs';
import * as pulumi from '@pulumi/pulumi';

/**
 * Substitutes placeholders in a script with provided values
 * @param scriptPath Path to the script file
 * @param substitutions Object with key-value pairs to replace
 * @returns Processed script content
 */
export function processScript(
    scriptPath: string, 
    substitutions: Record<string, pulumi.Input<string | number | undefined>> = {}
): pulumi.Output<string> {
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');

    return pulumi.all(
        Object.keys(substitutions).map(key => pulumi.output(substitutions[key]))
    ).apply(() => {
        let processedScript = scriptContent;
        
        return pulumi.all(
            Object.entries(substitutions).map(([key, value]) => 
                pulumi.output(value).apply(v => {
                    processedScript = processedScript.replace(
                        new RegExp(key, 'g'), 
                        v !== undefined ? String(v) : ''
                    );
                    return processedScript;
                })
            )
        ).apply(() => processedScript);
        }
    )
}