// Generated from FHIR-Converter/src/lib/outputProcessor/json.g4 by ANTLR 4.10.1
// jshint ignore: start
import antlr4 from 'antlr4';
import jsonListener from './jsonListener.js';
import jsonVisitor from './jsonVisitor.js';

const serializedATN = [4,1,12,71,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,
1,0,1,0,1,1,1,1,5,1,15,8,1,10,1,12,1,18,9,1,1,1,5,1,21,8,1,10,1,12,1,24,
9,1,1,1,5,1,27,8,1,10,1,12,1,30,9,1,1,1,1,1,1,2,1,2,1,2,1,2,1,2,3,2,39,8,
2,1,3,1,3,5,3,43,8,3,10,3,12,3,46,9,3,1,3,5,3,49,8,3,10,3,12,3,52,9,3,1,
3,5,3,55,8,3,10,3,12,3,58,9,3,1,3,1,3,1,4,1,4,1,4,1,4,1,4,1,4,1,4,3,4,69,
8,4,1,4,0,0,5,0,2,4,6,8,0,0,78,0,10,1,0,0,0,2,12,1,0,0,0,4,38,1,0,0,0,6,
40,1,0,0,0,8,68,1,0,0,0,10,11,3,2,1,0,11,1,1,0,0,0,12,22,5,1,0,0,13,15,5,
2,0,0,14,13,1,0,0,0,15,18,1,0,0,0,16,14,1,0,0,0,16,17,1,0,0,0,17,19,1,0,
0,0,18,16,1,0,0,0,19,21,3,4,2,0,20,16,1,0,0,0,21,24,1,0,0,0,22,20,1,0,0,
0,22,23,1,0,0,0,23,28,1,0,0,0,24,22,1,0,0,0,25,27,5,2,0,0,26,25,1,0,0,0,
27,30,1,0,0,0,28,26,1,0,0,0,28,29,1,0,0,0,29,31,1,0,0,0,30,28,1,0,0,0,31,
32,5,3,0,0,32,3,1,0,0,0,33,34,5,10,0,0,34,39,5,4,0,0,35,36,5,10,0,0,36,37,
5,4,0,0,37,39,3,8,4,0,38,33,1,0,0,0,38,35,1,0,0,0,39,5,1,0,0,0,40,50,5,5,
0,0,41,43,5,2,0,0,42,41,1,0,0,0,43,46,1,0,0,0,44,42,1,0,0,0,44,45,1,0,0,
0,45,47,1,0,0,0,46,44,1,0,0,0,47,49,3,8,4,0,48,44,1,0,0,0,49,52,1,0,0,0,
50,48,1,0,0,0,50,51,1,0,0,0,51,56,1,0,0,0,52,50,1,0,0,0,53,55,5,2,0,0,54,
53,1,0,0,0,55,58,1,0,0,0,56,54,1,0,0,0,56,57,1,0,0,0,57,59,1,0,0,0,58,56,
1,0,0,0,59,60,5,6,0,0,60,7,1,0,0,0,61,69,5,10,0,0,62,69,5,11,0,0,63,69,3,
2,1,0,64,69,3,6,3,0,65,69,5,7,0,0,66,69,5,8,0,0,67,69,5,9,0,0,68,61,1,0,
0,0,68,62,1,0,0,0,68,63,1,0,0,0,68,64,1,0,0,0,68,65,1,0,0,0,68,66,1,0,0,
0,68,67,1,0,0,0,69,9,1,0,0,0,8,16,22,28,38,44,50,56,68];


const atn = new antlr4.atn.ATNDeserializer().deserialize(serializedATN);

const decisionsToDFA = atn.decisionToState.map( (ds, index) => new antlr4.dfa.DFA(ds, index) );

const sharedContextCache = new antlr4.PredictionContextCache();

export default class jsonParser extends antlr4.Parser {

    static grammarFileName = "json.g4";
    static literalNames = [ null, "'{'", "','", "'}'", "':'", "'['", "']'", 
                            "'true'", "'false'", "'null'" ];
    static symbolicNames = [ null, null, null, null, null, null, null, null, 
                             null, null, "STRING", "NUMBER", "WS" ];
    static ruleNames = [ "json", "obj", "pair", "array", "value" ];

    constructor(input) {
        super(input);
        this._interp = new antlr4.atn.ParserATNSimulator(this, atn, decisionsToDFA, sharedContextCache);
        this.ruleNames = jsonParser.ruleNames;
        this.literalNames = jsonParser.literalNames;
        this.symbolicNames = jsonParser.symbolicNames;
    }

    get atn() {
        return atn;
    }



	json() {
	    let localctx = new JsonContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 0, jsonParser.RULE_json);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 10;
	        this.obj();
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	obj() {
	    let localctx = new ObjContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 2, jsonParser.RULE_obj);
	    var _la = 0; // Token type
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 12;
	        this.match(jsonParser.T__0);
	        this.state = 22;
	        this._errHandler.sync(this);
	        var _alt = this._interp.adaptivePredict(this._input,1,this._ctx)
	        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	            if(_alt===1) {
	                this.state = 16;
	                this._errHandler.sync(this);
	                _la = this._input.LA(1);
	                while(_la===jsonParser.T__1) {
	                    this.state = 13;
	                    this.match(jsonParser.T__1);
	                    this.state = 18;
	                    this._errHandler.sync(this);
	                    _la = this._input.LA(1);
	                }
	                this.state = 19;
	                this.pair(); 
	            }
	            this.state = 24;
	            this._errHandler.sync(this);
	            _alt = this._interp.adaptivePredict(this._input,1,this._ctx);
	        }

	        this.state = 28;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        while(_la===jsonParser.T__1) {
	            this.state = 25;
	            this.match(jsonParser.T__1);
	            this.state = 30;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        }
	        this.state = 31;
	        this.match(jsonParser.T__2);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	pair() {
	    let localctx = new PairContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 4, jsonParser.RULE_pair);
	    try {
	        this.state = 38;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,3,this._ctx);
	        switch(la_) {
	        case 1:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 33;
	            this.match(jsonParser.STRING);
	            this.state = 34;
	            this.match(jsonParser.T__3);
	            break;

	        case 2:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 35;
	            this.match(jsonParser.STRING);
	            this.state = 36;
	            this.match(jsonParser.T__3);
	            this.state = 37;
	            this.value();
	            break;

	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	array() {
	    let localctx = new ArrayContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 6, jsonParser.RULE_array);
	    var _la = 0; // Token type
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 40;
	        this.match(jsonParser.T__4);
	        this.state = 50;
	        this._errHandler.sync(this);
	        var _alt = this._interp.adaptivePredict(this._input,5,this._ctx)
	        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	            if(_alt===1) {
	                this.state = 44;
	                this._errHandler.sync(this);
	                _la = this._input.LA(1);
	                while(_la===jsonParser.T__1) {
	                    this.state = 41;
	                    this.match(jsonParser.T__1);
	                    this.state = 46;
	                    this._errHandler.sync(this);
	                    _la = this._input.LA(1);
	                }
	                this.state = 47;
	                this.value(); 
	            }
	            this.state = 52;
	            this._errHandler.sync(this);
	            _alt = this._interp.adaptivePredict(this._input,5,this._ctx);
	        }

	        this.state = 56;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        while(_la===jsonParser.T__1) {
	            this.state = 53;
	            this.match(jsonParser.T__1);
	            this.state = 58;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        }
	        this.state = 59;
	        this.match(jsonParser.T__5);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	value() {
	    let localctx = new ValueContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 8, jsonParser.RULE_value);
	    try {
	        this.state = 68;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case jsonParser.STRING:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 61;
	            this.match(jsonParser.STRING);
	            break;
	        case jsonParser.NUMBER:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 62;
	            this.match(jsonParser.NUMBER);
	            break;
	        case jsonParser.T__0:
	            this.enterOuterAlt(localctx, 3);
	            this.state = 63;
	            this.obj();
	            break;
	        case jsonParser.T__4:
	            this.enterOuterAlt(localctx, 4);
	            this.state = 64;
	            this.array();
	            break;
	        case jsonParser.T__6:
	            this.enterOuterAlt(localctx, 5);
	            this.state = 65;
	            this.match(jsonParser.T__6);
	            break;
	        case jsonParser.T__7:
	            this.enterOuterAlt(localctx, 6);
	            this.state = 66;
	            this.match(jsonParser.T__7);
	            break;
	        case jsonParser.T__8:
	            this.enterOuterAlt(localctx, 7);
	            this.state = 67;
	            this.match(jsonParser.T__8);
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}


}

jsonParser.EOF = antlr4.Token.EOF;
jsonParser.T__0 = 1;
jsonParser.T__1 = 2;
jsonParser.T__2 = 3;
jsonParser.T__3 = 4;
jsonParser.T__4 = 5;
jsonParser.T__5 = 6;
jsonParser.T__6 = 7;
jsonParser.T__7 = 8;
jsonParser.T__8 = 9;
jsonParser.STRING = 10;
jsonParser.NUMBER = 11;
jsonParser.WS = 12;

jsonParser.RULE_json = 0;
jsonParser.RULE_obj = 1;
jsonParser.RULE_pair = 2;
jsonParser.RULE_array = 3;
jsonParser.RULE_value = 4;

class JsonContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = jsonParser.RULE_json;
    }

	obj() {
	    return this.getTypedRuleContext(ObjContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof jsonListener ) {
	        listener.enterJson(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof jsonListener ) {
	        listener.exitJson(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof jsonVisitor ) {
	        return visitor.visitJson(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



class ObjContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = jsonParser.RULE_obj;
    }

	pair = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(PairContext);
	    } else {
	        return this.getTypedRuleContext(PairContext,i);
	    }
	};

	enterRule(listener) {
	    if(listener instanceof jsonListener ) {
	        listener.enterObj(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof jsonListener ) {
	        listener.exitObj(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof jsonVisitor ) {
	        return visitor.visitObj(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



class PairContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = jsonParser.RULE_pair;
    }

	STRING() {
	    return this.getToken(jsonParser.STRING, 0);
	};

	value() {
	    return this.getTypedRuleContext(ValueContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof jsonListener ) {
	        listener.enterPair(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof jsonListener ) {
	        listener.exitPair(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof jsonVisitor ) {
	        return visitor.visitPair(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



class ArrayContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = jsonParser.RULE_array;
    }

	value = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ValueContext);
	    } else {
	        return this.getTypedRuleContext(ValueContext,i);
	    }
	};

	enterRule(listener) {
	    if(listener instanceof jsonListener ) {
	        listener.enterArray(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof jsonListener ) {
	        listener.exitArray(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof jsonVisitor ) {
	        return visitor.visitArray(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



class ValueContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = jsonParser.RULE_value;
    }

	STRING() {
	    return this.getToken(jsonParser.STRING, 0);
	};

	NUMBER() {
	    return this.getToken(jsonParser.NUMBER, 0);
	};

	obj() {
	    return this.getTypedRuleContext(ObjContext,0);
	};

	array() {
	    return this.getTypedRuleContext(ArrayContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof jsonListener ) {
	        listener.enterValue(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof jsonListener ) {
	        listener.exitValue(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof jsonVisitor ) {
	        return visitor.visitValue(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}




jsonParser.JsonContext = JsonContext; 
jsonParser.ObjContext = ObjContext; 
jsonParser.PairContext = PairContext; 
jsonParser.ArrayContext = ArrayContext; 
jsonParser.ValueContext = ValueContext; 
