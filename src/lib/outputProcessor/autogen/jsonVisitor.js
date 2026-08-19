// Generated from FHIR-Converter/src/lib/outputProcessor/json.g4 by ANTLR 4.10.1
// jshint ignore: start
import antlr4 from 'antlr4';

// This class defines a complete generic visitor for a parse tree produced by jsonParser.

export default class jsonVisitor extends antlr4.tree.ParseTreeVisitor {

	// Visit a parse tree produced by jsonParser#json.
	visitJson(ctx) {
	  return this.visitChildren(ctx);
	}


	// Visit a parse tree produced by jsonParser#obj.
	visitObj(ctx) {
	  return this.visitChildren(ctx);
	}


	// Visit a parse tree produced by jsonParser#pair.
	visitPair(ctx) {
	  return this.visitChildren(ctx);
	}


	// Visit a parse tree produced by jsonParser#array.
	visitArray(ctx) {
	  return this.visitChildren(ctx);
	}


	// Visit a parse tree produced by jsonParser#value.
	visitValue(ctx) {
	  return this.visitChildren(ctx);
	}



}