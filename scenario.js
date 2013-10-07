/* ***************************************************
 * Scenario and Action
 *****************************************************/

scenario = {};
 
scenario.Scene = Backbone.Collection.extend({
    model: scenario.Action,
    
    initialize: function() {
        // Links of actions, actions can be linked non linearly
        //this.links = {};
        
        // Current action
        this._progress = 0;
        
        // Register the history of actions names, use name instead of index in collection for avoiding changement in collection, like insertion
        this.history = new Array();
        
        // Length of actions with one default chain
        this.predictLength = 0;
        
        // Length valide or not, everytime action added or deleted, link added
        this.predictLengthValid = false;
        
        // Flag to indicate if the jump action is a rollback
        this.rollback = false;
        
        // Current max index of action
        this.maxProgress = 0;
        
        // Scene end or not
        this.end = false;
        
        
        this.listenTo(this, "add", this.actionAdded);
    },
    
    get progress() {
        return this._progress;
    },
    set progress(progress) {
        if(!isNaN(progress) && progress < this.actions.length && progress >= 0) {
            this._progress = progress;
        }
    },
    
    count: function() {
        if (!this.predictLengthValid) {
            // Calcul length
            var historyLength = this.history.length;
            var index = historyLength > 0 ? this.getActionIndex(this.history[historyLength-1]) : 0;
            var count = historyLength;
            
            while (index < this.length) {
                // Get current action
                var action = this.at(index);
                // Default, increment index
                index ++;
                // Check exits
                if (action.hasExit()) {
                    var nextname = action.getExitName();
                    var next = this.getActionIndex(nextname);
                    if (next >= 0) {
                        index = next;
                    }
                }
                count ++;
            }
            this.predictLength = count;
            this.predictLengthValid = true;
        }
        
        return this.predictLength;
    },
    
    directReachable: function(progress) {
        if (progress > this.maxProgress) {
            return false;
        }
        else return true;
    },
    
    // Reset all actions, reset attributes, empty history
    reset: function() {
        this.each(function(action) {
            action.reset();
        });
        
        this.history = [];
        
        this.progress = 0;
        this.predictLength = 0;
        this.predictLengthValid = false;
        this.rollback = false;
        this.maxProgress = 0;
        this.end = false;
    },
    
    quit: function() {
        this.at(this.progress).quit();
        this.end = true;
    },
    
    run: function(progress) {
        if (this.end) {
            return;
        }
        // Scenario finished
        if(progress >= this.length) {
            this.quit();
            return;
        }
        
        // Switch rollback flag
        if (this.rollback) {
            this.rollback = false;
        }
        // Otherwise push the current action name to history
        else this.history.push( this.at(this.progress).get("name") );
        this.progress = progress;
        // Register max progress
        if (this.progress > this.maxProgress) {
            this.maxProgress = this.progress;
        }
        
        var action = this.at(this.progress);
        action.reset();
        
        var beginDelay = action.get("beginDelay");
        if(beginDelay) {
            _.delay(function() {
                action.start();
            }, beginDelay);
        }
        else action.start();
    },
    
    passNext: function() {
        if(this.progress < this.length) {
            this.at(this.progress).end();
        }
    },
    
    gotoPrev: function() {
        if(this.progress > 0) {
            this.at(this.progress).end(true);
            // Goto registered previous
            var previous = this.history.pop();
            if (previous) {
                this.rollback = true;
                this.jumpToAction(previous);
            }
        }
    },
    
    actionEnded: function(action) {
        // Check existance
        var id = this.indexOf(action);
        
        if(id != -1) {
            // Find exit
            var exitid = action.hasExit() ? this.getActionIndex( action.getExitName() ) : id+1;
            
            var endDelay = action.get("endDelay");
            if(endDelay > 0) {
                var scene = this;
                _.delay(function() {
                    scene.run(exitid);
                }, endDelay);
            }
            else this.run(exitid);
        }
    },
    
    actionExitChanged: function() {
        this.predictLengthValid = false;
    },
    
    
    jumpTo: function(progress) {
        var action = this.at(progress);
        
        // Action must exist and be reachable
        if ( action && this.directReachable(progress) ) {
            var name = action.get("name");
            var idHistory = this.history.indexOf(name);
            if (idHistory != -1) {
                for (var i = this.history.length-1; i > idHistory; i--) {
                    this.history.pop();
                }
                
                this.rollback = true;
            }
            
            action.end(true);
            this.run(progress);
        }
    },
    
    jumpToAction: function(name) {
        var progress = this.getActionIndex(name);
        
        this.jumpTo(progress);
    },
    
    
    getAction: function(name) {
        return this.findWhere({"name": name});
    },
    
    getActionIndex: function(name) {
        for (var i = 0; i < this.length; i++) {
            if(this.at(i).get("name") == name)
                return i;
        }
        return -1;
    },
    
    actionAdded: function(action) {
        action.set("scene", this);
        
        this.listenTo(action, "change:exit", this.actionExitChanged);
        
        // Predicted length no longer valide
        if (this.predictLengthValid) {
            this.predictLengthValid = false;
        }
    },
    
    insertActionAfter: function(action, target) {
        if(action instanceof MseAction) {
        
            if (target instanceof String) {
                target = this.getAction(target);
            }
        
            id = this.actions.indexOf(target);
            if(id >= 0) {
                this.actions.splice(id, 0, action);
                action.set("scene", this);
                
                // Predicted length no longer valide
                if (this.predictLengthValid) {
                    this.predictLengthValid = false;
                }
            }
            
        }
    }
});




var Action = Backbone.Model.extend({
    
    defaults: {
        // State can be "INIT", "START", "END"
        "state": "INIT",
        
        // Scene which own this action
        "scene": null,
        
        // Possible exits list, name: exitActionName
        "exits": {},
        
        // Current exit name
        "exit": "",
        
        // This must be initialized
        "name": "",
        
        "beginDelay": 0,
        
        "endDelay": 0
    },
    
    initialize: function() {
        this.autoSetExit();
        // Update new exit if necessary
        this.listenTo(this, "change:exits", this.autoSetExit);
    },
    
    autoSetExit: function() {
        var exitkeys = _.keys(this.get("exits"));
        
        // Only update if exit name not exist in new exits keys
        if ( exitkeys.length > 0 && exitkeys.indexOf(this.get("exit")) == -1 ) {
            this.set("exit", exitkeys[0]);
        }
    },
    
    hasExit: function() {
        return this.get("exit") != "";
    },
    
    getExitName: function() {
        return this.get("exits")[this.get("exit")] ?: "";
    },
    
    validate: function(attrs, options) {
        // Noew it's only
        if (typeof attrs.realStart != "function") {
            delete attrs["realStart"];
        }
        
        if (typeof attrs.realEnd != "function") {
            delete attrs["realEnd"];
        }
    },
    
    realStart: function() {},
    realEnd: function() {},
    
    reset: function() {
        this.set("state", "INIT");
    },
    
    quit: function() {
        this.realEnd();
        this.set("state", "END");
    },
    
    previousAction: function() {
        var scene = this.get("scene");
        if(scene) {
            return scene.getAction(scene.previous);
        }
        else return null;
    },
    
    start: function() {
        this.set("state", "START");
        
        this.realStart();
        this.trigger("started");
    },
    
    end: function(stopScena, exit) {
        this.trigger("ended");
        try {
            this.realEnd();
        }
        catch (error) {
            // Do nothing, it avoid anything wrong in custom code from causing the crush of whole chain of actions
            console.error ? console.error("Action ("+this.id+": "+this.get("name")+") crashed on its end function.") : 0;
        }
        this.set("state", "END");
        
        // Exit given
        if (exit) {
            this.set("exit", exit);
        }
        
        var scene = this.get("scene");
        if(!stopScena && scene) {
            // No defined exit
            scene.actionEnded(this);
        }
    }
});
