import {Tokenizer} from "liquidjs";
import Ajv from 'ajv';
import assert from "assert";
import * as fs from 'fs';

export default {
    parse: function (token, remainingToken) {
        this.templates = [];
        const tokenizer = new Tokenizer(token.args, this.liquid.options.operatorsTrie);
        let closed = false;

        const filePath = tokenizer.readQuoted().getText().slice(1, -1);
        assert(filePath, () => `file name is missing ${filePath}`);

        this['filePath'] = `${this.liquid.options.root}/${filePath}`;

        while (remainingToken.length) {
            let currentToken = remainingToken.shift();

            if (currentToken.name === 'endvalidate') {
                closed = true;
                break;
            }

            let template = this.liquid.parser.parseToken(currentToken, remainingToken);
            this.templates.push(template);
        }
        if (!closed) throw new Error(`tag ${token.getText()} not closed`);
    },
    render: function* (context) {
        const {liquid} = this;
        const rendered = yield liquid.renderer.renderTemplates(this.templates, context);
        const parsedJson = JSON.parse(rendered);

        const schema = JSON.parse(fs.readFileSync(this['filePath']));
        const ajv = new Ajv();
        const validate = ajv.compile(schema);
        const valid = validate(parsedJson);

        if (!valid)
            throw new Error(`error during validation with schema ${this['filePath']}! failed with ${ajv.errorsText(validate.errors)}`);
    }
};
